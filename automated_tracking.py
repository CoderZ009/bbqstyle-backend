import schedule
import time
from order_tracking_system import OrderTrackingSystem, TrackingScheduler

def setup_automated_tracking():
    """Set up automated tracking that runs every hour"""
    tracking_system = OrderTrackingSystem()
    scheduler = TrackingScheduler(tracking_system)
    
    # Load orders from database (replace with your DB logic)
    def load_pending_orders():
        # Mock data - replace with actual database query
        return [
            {'order_id': 'ORD001', 'tracking_number': 'TBA123456789', 'carrier': 'amazon'},
            {'order_id': 'ORD002', 'tracking_number': 'XB123456789', 'carrier': 'xpressbees'},
            {'order_id': 'ORD003', 'tracking_number': 'SR123456789', 'carrier': 'shiprocket'}
        ]
    
    def update_all_orders():
        """Update all pending orders"""
        orders = load_pending_orders()
        
        for order in orders:
            scheduler.add_order(
                order['order_id'],
                order['tracking_number'],
                order['carrier']
            )
        
        scheduler.run_tracking_updates()
        scheduler.orders_to_track.clear()  # Clear for next run
    
    # Schedule updates every hour
    schedule.every().hour.do(update_all_orders)
    
    print("Automated tracking system started...")
    
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    setup_automated_tracking()