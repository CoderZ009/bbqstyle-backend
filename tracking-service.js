const axios = require('axios');
const mysql = require('mysql');
require('dotenv').config();

// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Track order and update status in DB
async function trackAndUpdateOrder(trackingId, carrier) {
    try {
        const trackingData = await getTrackingData(trackingId, carrier);
        
        if (trackingData.success) {
            // Update order status in database
            await new Promise((resolve, reject) => {
                db.query('UPDATE orders SET status = ? WHERE tracking_id = ?', 
                    [trackingData.status, trackingId], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
            });
            
            console.log(`Updated order ${trackingId} to status: ${trackingData.status}`);
            return trackingData;
        }
        
        return { success: false, error: 'No tracking data available' };
    } catch (error) {
        console.error('Track and update error:', error);
        return { success: false, error: error.message };
    }
}

// Get tracking data from carriers
async function getTrackingData(trackingNumber, carrier) {
    switch (carrier.toLowerCase()) {
        case 'amazon':
            return await trackAmazon(trackingNumber);
        case 'xpressbees':
            return await trackXpressBees(trackingNumber);
        case 'shiprocket':
            return await trackShiprocket(trackingNumber);
        default:
            return { success: false, error: 'Unsupported carrier' };
    }
}

async function trackAmazon(trackingNumber) {
    try {
        const response = await axios.get(`https://track.amazon.com/api/tracker/${trackingNumber}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        if (response.data?.eventHistory?.[0]) {
            const latest = response.data.eventHistory[0];
            return {
                success: true,
                status: normalizeStatus(latest.statusText, 'amazon'),
                location: latest.location || 'N/A',
                timestamp: latest.eventTime || new Date().toISOString()
            };
        }
        return { success: false, error: 'No tracking data' };
    } catch (error) {
        return { success: false, error: 'Amazon tracking unavailable' };
    }
}

async function trackXpressBees(trackingNumber) {
    try {
        const response = await axios.get(`https://www.xpressbees.com/api/shipments/track/${trackingNumber}`, {
            headers: {
                'Authorization': `Bearer ${process.env.XPRESSBEES_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        if (response.data?.status === 'success') {
            const data = response.data.data;
            return {
                success: true,
                status: normalizeStatus(data.current_status, 'xpressbees'),
                location: data.current_location || 'N/A',
                timestamp: data.last_update_time || new Date().toISOString()
            };
        }
        return { success: false, error: 'No tracking data' };
    } catch (error) {
        return { success: false, error: 'XpressBees tracking unavailable' };
    }
}

async function trackShiprocket(trackingNumber) {
    try {
        const response = await axios.get(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${trackingNumber}`, {
            headers: {
                'Authorization': `Bearer ${process.env.SHIPROCKET_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        if (response.data?.tracking_data?.shipment_track?.length > 0) {
            const latest = response.data.tracking_data.shipment_track.slice(-1)[0];
            return {
                success: true,
                status: normalizeStatus(latest.current_status, 'shiprocket'),
                location: latest.location || 'N/A',
                timestamp: latest.date || new Date().toISOString()
            };
        }
        return { success: false, error: 'No tracking data' };
    } catch (error) {
        return { success: false, error: 'Shiprocket tracking unavailable' };
    }
}

function normalizeStatus(status, carrier) {
    const statusMap = {
        // Amazon
        'shipped': 'shipped',
        'out for delivery': 'out_for_delivery',
        'delivered': 'delivered',
        'in transit': 'in_transit',
        'arriving today': 'out_for_delivery',
        
        // XpressBees
        'pickup scheduled': 'processing',
        'picked up': 'shipped',
        
        // Shiprocket
        'pickup scheduled': 'processing',
        'picked up': 'shipped',
        'rto': 'returned',
        'exception': 'delayed'
    };
    
    return statusMap[status?.toLowerCase()] || 'processing';
}

// Bulk update all orders with tracking
async function bulkUpdateTracking() {
    try {
        const orders = await new Promise((resolve, reject) => {
            db.query(`
                SELECT order_id, tracking_id, carrier, status 
                FROM orders 
                WHERE tracking_id IS NOT NULL 
                AND carrier IS NOT NULL 
                AND status NOT IN ('delivered', 'cancelled', 'returned')
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        let updated = 0;
        for (const order of orders) {
            const result = await trackAndUpdateOrder(order.tracking_id, order.carrier);
            if (result.success) updated++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
        }
        
        return { success: true, updated, total: orders.length };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    trackAndUpdateOrder,
    getTrackingData,
    bulkUpdateTracking
};