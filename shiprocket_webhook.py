from flask import Flask, request, jsonify
import json
from datetime import datetime

app = Flask(__name__)

@app.route('/webhook/shiprocket', methods=['POST'])
def shiprocket_webhook():
    """Handle Shiprocket webhook notifications"""
    try:
        data = request.get_json()
        
        # Extract tracking information
        awb = data.get('awb')
        current_status = data.get('current_status')
        order_id = data.get('order_id')
        
        # Update order status in your database
        update_order_from_webhook(order_id, awb, current_status, data)
        
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 400

def update_order_from_webhook(order_id, awb, status, full_data):
    """Update order status from webhook data"""
    normalized_status = normalize_shiprocket_webhook_status(status)
    
    # Replace with your database update logic
    print(f"Webhook update - Order: {order_id}, AWB: {awb}, Status: {normalized_status}")
    
    # Your database update code here
    # db.update_order_status(order_id, normalized_status)

def normalize_shiprocket_webhook_status(status):
    """Normalize Shiprocket webhook status"""
    status_map = {
        'Shipped': 'shipped',
        'In Transit': 'in_transit',
        'Out For Delivery': 'out_for_delivery',
        'Delivered': 'delivered',
        'RTO': 'returned',
        'Exception': 'delayed'
    }
    return status_map.get(status, 'processing')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)