document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        // Get form values
        const name = document.getElementById('name').value.trim();
        const subject = document.getElementById('subject').value;
        const message = document.getElementById('message').value.trim();
        const consent = document.getElementById('consent').checked;
        // Validate form
        if (!name || !subject || !message || !consent) {
            alert('Please fill all required fields and agree to the terms.');
            return;
        }
        // Create WhatsApp message
        const whatsappMessage = `Hi! I'm ${name}.\n\nSubject: ${subject}\n\nMessage: ${message}`;
        // Encode message for URL
        const encodedMessage = encodeURIComponent(whatsappMessage);
        // WhatsApp number (replace with your actual number)
        const whatsappNumber = '918901551059';
        // Create WhatsApp URL
        const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
        // Open WhatsApp
        window.open(whatsappURL, '_blank');
        // Reset form
        contactForm.reset();
        // Show success message
        const successMessage = document.getElementById('successMessage');
        successMessage.classList.remove('hidden');
        // Hide success message after 5 seconds
        setTimeout(() => {
            successMessage.classList.add('hidden');
        }, 5000);
    });
});
