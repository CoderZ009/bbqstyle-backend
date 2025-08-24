// Enhanced order tracking with carrier integration
class OrderTracker {
    constructor() {
        this.init();
    }
    init() {
        this.bindEvents();
        this.checkUrlParams();
    }
    bindEvents() {
        const trackingForm = document.getElementById('trackingForm');
        if (trackingForm) {
            trackingForm.addEventListener('submit', (e) => this.handleTrackingSubmit(e));
        }
    }
    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('order_id');
        if (orderId) {
            document.getElementById('trackingInput').value = orderId;
            this.trackOrder(orderId);
        }
    }
    async handleTrackingSubmit(e) {
        e.preventDefault();
        const trackingInput = document.getElementById('trackingInput').value.trim();
        if (!trackingInput) return;
        this.showLoading(true);
        await this.trackOrder(trackingInput);
        this.showLoading(false);
    }
    async trackOrder(trackingInput) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/track-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ trackingInput })
            });
            const data = await response.json();
            if (data.success) {
                this.displayTrackingResult(data);
                this.hideError();
            } else {
                this.showError(data.message || 'Order not found or tracking not available');
                this.hideTrackingResult();
            }
        } catch (error) {
            console.error('Tracking error:', error);
            this.showError('Unable to fetch tracking information. Please try again.');
            this.hideTrackingResult();
        }
    }
    displayTrackingResult(data) {
        // Remove existing result if any
        const existingResult = document.getElementById('trackingResult');
        if (existingResult) {
            existingResult.remove();
        }
        const resultHtml = this.createTrackingResultHtml(data);
        // Insert after the form
        const form = document.getElementById('trackingForm').parentElement;
        form.insertAdjacentHTML('afterend', resultHtml);
        // Add animation
        setTimeout(() => {
            const result = document.getElementById('trackingResult');
            if (result) {
                result.classList.add('show');
            }
        }, 100);
    }
    createTrackingResultHtml(data) {
        const statusColor = this.getStatusColor(data.status);
        const statusText = this.getStatusText(data.status);
        let trackingContent = `
            <div id="trackingResult" class="mt-8 bg-white rounded-lg shadow-md p-6 opacity-0 transition-opacity duration-300">
                <div class="border-b pb-4 mb-4">
                    <h2 class="text-2xl font-bold text-gray-800 mb-2">Tracking Information</h2>
                    <div class="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span><strong>Order ID:</strong> ${data.orderId}</span>
                        ${data.trackingId ? `<span><strong>Tracking ID:</strong> ${data.trackingId}</span>` : ''}
                        ${data.carrier ? `<span><strong>Carrier:</strong> ${this.getCarrierName(data.carrier)}</span>` : ''}
                    </div>
                </div>
        `;
        if (data.status && data.location) {
            // Live tracking data available
            trackingContent += `
                <div class="mb-6">
                    <div class="flex items-center mb-3">
                        <div class="w-4 h-4 rounded-full ${statusColor} mr-3"></div>
                        <span class="text-lg font-semibold text-gray-800">${statusText}</span>
                    </div>
                    <div class="ml-7 text-gray-600">
                        <p><strong>Location:</strong> ${data.location}</p>
                        <p><strong>Last Updated:</strong> ${this.formatTimestamp(data.timestamp)}</p>
                    </div>
                </div>
                <div class="bg-gray-50 rounded-lg p-4 mb-4">
                    <h3 class="font-semibold text-gray-800 mb-2">Delivery Status</h3>
                    <div class="flex justify-between items-center">
                        ${this.createStatusTimeline(data.status)}
                    </div>
                </div>
            `;
        }
        if (data.trackingLink) {
            trackingContent += `
                <div class="mt-4">
                    <a href="${data.trackingLink}" target="_blank" 
                       class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                        Track on Carrier Website
                    </a>
                </div>
            `;
        }
        trackingContent += `</div>`;
        return trackingContent;
    }
    createStatusTimeline(currentStatus) {
        const statuses = [
            { key: 'processing', label: 'Processing' },
            { key: 'shipped', label: 'Shipped' },
            { key: 'in_transit', label: 'In Transit' },
            { key: 'out_for_delivery', label: 'Out for Delivery' },
            { key: 'delivered', label: 'Delivered' }
        ];
        const currentIndex = statuses.findIndex(s => s.key === currentStatus);
        return statuses.map((status, index) => {
            const isActive = index <= currentIndex;
            const isCurrent = status.key === currentStatus;
            return `
                <div class="flex flex-col items-center flex-1">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center ${
                        isActive ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                    } ${isCurrent ? 'ring-4 ring-green-200' : ''}">
                        ${isActive ? '✓' : index + 1}
                    </div>
                    <span class="text-xs mt-1 text-center ${isActive ? 'text-green-600 font-semibold' : 'text-gray-500'}">${status.label}</span>
                </div>
            `;
        }).join('');
    }
    getStatusColor(status) {
        const colors = {
            'processing': 'bg-yellow-500',
            'shipped': 'bg-blue-500',
            'in_transit': 'bg-blue-600',
            'out_for_delivery': 'bg-orange-500',
            'delivered': 'bg-green-500',
            'cancelled': 'bg-red-500',
            'returned': 'bg-gray-500',
            'delayed': 'bg-red-400'
        };
        return colors[status] || 'bg-gray-400';
    }
    getStatusText(status) {
        const texts = {
            'processing': 'Order Processing',
            'shipped': 'Shipped',
            'in_transit': 'In Transit',
            'out_for_delivery': 'Out for Delivery',
            'delivered': 'Delivered',
            'cancelled': 'Cancelled',
            'returned': 'Returned',
            'delayed': 'Delayed'
        };
        return texts[status] || 'Unknown Status';
    }
    getCarrierName(carrier) {
        const names = {
            'amazon': 'Amazon Logistics',
            'xpressbees': 'XpressBees',
            'shiprocket': 'Shiprocket'
        };
        return names[carrier?.toLowerCase()] || carrier;
    }
    formatTimestamp(timestamp) {
        if (!timestamp) return 'N/A';
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return timestamp;
        }
    }
    showLoading(show) {
        const button = document.querySelector('#trackingForm button[type="submit"]');
        if (button) {
            if (show) {
                button.disabled = true;
                button.innerHTML = `
                    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Tracking...
                `;
            } else {
                button.disabled = false;
                button.innerHTML = 'Track Order';
            }
        }
    }
    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.querySelector('p').textContent = message;
            errorDiv.classList.remove('hidden');
        }
    }
    hideError() {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    }
    hideTrackingResult() {
        const result = document.getElementById('trackingResult');
        if (result) {
            result.remove();
        }
    }
}
// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OrderTracker();
});
