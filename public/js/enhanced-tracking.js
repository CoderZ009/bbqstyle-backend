// Enhanced tracking that uses the new API endpoints
class EnhancedOrderTracker {
    constructor() {
        this.init();
    }
    init() {
        this.bindEvents();
        this.checkUrlParams();
    }
    bindEvents() {
        const enhancedBtn = document.getElementById('enhancedTrackingBtn');
        if (enhancedBtn) {
            enhancedBtn.addEventListener('click', () => this.handleEnhancedTracking());
        }
    }
    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('order_id');
        if (orderId) {
            document.getElementById('trackingInput').value = orderId;
        }
    }
    async handleEnhancedTracking() {
        const trackingInput = document.getElementById('trackingInput').value.trim();
        if (!trackingInput) return;
        this.showLoading(true);
        await this.trackOrderEnhanced(trackingInput);
        this.showLoading(false);
    }
    async trackOrderEnhanced(trackingInput) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/track-order-enhanced`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ trackingInput })
            });
            const data = await response.json();
            if (data.success) {
                this.displayEnhancedResult(data);
                this.hideError();
            } else {
                this.showError(data.message || 'Order not found or tracking not available');
                this.hideTrackingResult();
            }
        } catch (error) {
            console.error('Enhanced tracking error:', error);
            this.showError('Unable to fetch enhanced tracking information. Please try again.');
            this.hideTrackingResult();
        }
    }
    displayEnhancedResult(data) {
        const existingResult = document.getElementById('enhancedTrackingResult');
        if (existingResult) {
            existingResult.remove();
        }
        const resultHtml = this.createEnhancedResultHtml(data);
        const form = document.getElementById('trackingForm').parentElement;
        form.insertAdjacentHTML('afterend', resultHtml);
        setTimeout(() => {
            const result = document.getElementById('enhancedTrackingResult');
            if (result) {
                result.classList.add('show');
            }
        }, 100);
    }
    createEnhancedResultHtml(data) {
        const statusColor = this.getStatusColor(data.status);
        const statusText = this.getStatusText(data.status);
        return `
            <div id="enhancedTrackingResult" class="mt-8 bg-white rounded-lg shadow-md p-6 opacity-0 transition-opacity duration-300">
                <div class="border-b pb-4 mb-4">
                    <h2 class="text-2xl font-bold text-gray-800 mb-2">Enhanced Tracking Information</h2>
                    <div class="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span><strong>Order ID:</strong> ${data.orderId}</span>
                        ${data.trackingId ? `<span><strong>Tracking ID:</strong> ${data.trackingId}</span>` : ''}
                        ${data.carrier ? `<span class="carrier-badge ${data.carrier}"><strong>Carrier:</strong> ${this.getCarrierName(data.carrier)}</span>` : ''}
                    </div>
                </div>
                ${data.status && data.location ? `
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
                        <h3 class="font-semibold text-gray-800 mb-2">Delivery Progress</h3>
                        <div class="status-timeline">
                            ${this.createStatusTimeline(data.status)}
                        </div>
                    </div>
                ` : ''}
                ${data.trackingLink ? `
                    <div class="mt-4">
                        <a href="${data.trackingLink}" target="_blank" 
                           class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                            Track on Carrier Website
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
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
                <div class="status-step ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}">
                    <div class="status-step-icon">
                        ${isActive ? '✓' : index + 1}
                    </div>
                    <span class="status-step-label">${status.label}</span>
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
        const button = document.getElementById('enhancedTrackingBtn');
        if (button) {
            if (show) {
                button.disabled = true;
                button.innerHTML = 'Loading...';
            } else {
                button.disabled = false;
                button.innerHTML = 'Enhanced Tracking';
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
        const result = document.getElementById('enhancedTrackingResult');
        if (result) {
            result.remove();
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    window.enhancedTracker = new EnhancedOrderTracker();
});
