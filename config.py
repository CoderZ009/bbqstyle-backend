import os
from dotenv import load_dotenv

load_dotenv()

# API Configuration
AMAZON_TRACKING_URL = "https://track.amazon.com/api/tracker/"
XPRESSBEES_API_URL = "https://www.xpressbees.com/api"
SHIPROCKET_API_URL = "https://apiv2.shiprocket.in/v1/external"

# API Keys (set these in your .env file)
XPRESSBEES_TOKEN = os.getenv('XPRESSBEES_TOKEN', '<your_xpressbees_token>')
SHIPROCKET_TOKEN = os.getenv('SHIPROCKET_TOKEN', '<your_shiprocket_token>')

# Rate limiting (requests per minute)
RATE_LIMITS = {
    'amazon': 30,
    'xpressbees': 60,
    'shiprocket': 100
}