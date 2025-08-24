document.addEventListener('DOMContentLoaded', function () {
    // Load footer.html content into #footer div
    fetch('footer.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('footer').innerHTML = data;
            // After loading footer, set current year
            var date = new Date();
            var year = date.getFullYear();
            document.getElementById("y").innerHTML = year;
            // Initialize chat widget
            initializeChatWidget();
        })
        .catch(error => {
            console.error('Error loading footer:', error);
        });
});
function initializeChatWidget() {
    const chatButton = document.getElementById('chatButton');
    const closeChat = document.getElementById('closeChat');
    const sendMessage = document.getElementById('sendMessage');
    const chatMessage = document.getElementById('chatMessage');
    if (chatButton) {
        chatButton.addEventListener('click', toggleChat);
        chatButton.addEventListener('mouseover', function() {
            this.style.transform = 'scale(1.1)';
        });
        chatButton.addEventListener('mouseout', function() {
            this.style.transform = 'scale(1)';
        });
    }
    if (closeChat) {
        closeChat.addEventListener('click', toggleChat);
    }
    if (sendMessage) {
        sendMessage.addEventListener('click', sendWhatsAppMessage);
        sendMessage.addEventListener('mouseover', function() {
            this.style.background = '#128C7E';
        });
        sendMessage.addEventListener('mouseout', function() {
            this.style.background = '#25D366';
        });
    }
    if (chatMessage) {
        chatMessage.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                sendWhatsAppMessage();
            }
        });
    }
}
function toggleChat() {
    const form = document.getElementById('chatForm');
    const button = document.getElementById('chatButton');
    if (form && button) {
        if (form.style.display === 'none' || form.style.display === '') {
            form.style.display = 'block';
            form.style.animation = 'slideUp 0.3s ease';
            button.style.display = 'none';
        } else {
            form.style.display = 'none';
            button.style.display = 'flex';
        }
    }
}
function sendWhatsAppMessage() {
    const messageInput = document.getElementById('chatMessage');
    if (messageInput) {
        let message = messageInput.value.trim();
        if (message) {
            // Check if we're on product detail page and add URL
            if (window.location.pathname.includes('product-detail.html')) {
                message += `\n\nProduct Link: ${window.location.href}`;
            }
            const whatsappUrl = `https://wa.me/918901551059?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
            messageInput.value = '';
            toggleChat();
        }
    }
}
