export function createNotifier({ resend, config }) {
  return async function notifyNewEnquiry(enquiry) {
    const { error } = await resend.emails.send({
      from: config.NOTIFICATION_FROM,
      to: [config.BUSINESS_EMAIL],
      subject: `New website enquiry from ${enquiry.name}`,
      text: [
        `Name: ${enquiry.name}`,
        `Email: ${enquiry.email}`,
        `Phone: ${enquiry.phone || 'Not provided'}`,
        `Business: ${enquiry.business_name || 'Not provided'}`,
        `Service: ${enquiry.service}`,
        `Budget: ${enquiry.budget || 'Not provided'}`,
        '',
        enquiry.message
      ].join('\n')
    });
    if (error) throw new Error(`Notification provider error: ${error.message || 'unknown error'}`);
  };
}

export function createEmailService({ resend, config }) {
  async function send(to, subject, text) {
    const { error } = await resend.emails.send({
      from: config.NOTIFICATION_FROM,
      to: [to],
      subject,
      text
    });
    if (error) throw new Error(`Email provider error: ${error.message || 'unknown error'}`);
  }

  return {
    async notifyContact(message) {
      await send(config.ADMIN_EMAIL, `New contact message: ${message.subject}`, [
        `Name: ${message.name}`,
        `Email: ${message.email}`,
        `Phone: ${message.phone || 'Not provided'}`,
        `Subject: ${message.subject}`,
        '',
        message.message
      ].join('\n'));
    },
    async confirmContact(message) {
      await send(message.email, 'We received your message', `Hi ${message.name},\n\nThanks for contacting BruceMadeThis. Your message has been received, and we will reply as soon as possible.`);
    },
    async sendVerification(user, url) {
      await send(user.email, 'Verify your BruceMadeThis account', `Hi ${user.first_name || 'there'},\n\nVerify your email address by opening this one-time link (valid for 24 hours):\n${url}\n\nIf you did not create this account, you can ignore this email.`);
    },
    async sendPasswordReset(user, url) {
      await send(user.email, 'Reset your BruceMadeThis password', `A password reset was requested for your account. Open this one-time link within 1 hour to choose a new password:\n${url}\n\nIf you did not request a reset, you can ignore this email.`);
    },
    async notifyNewInquiry(client, inquiry) {
      await send(config.ADMIN_EMAIL, `New client inquiry: ${inquiry.project_title}`, [
        `Client: ${client.first_name} ${client.last_name}`,
        `Email: ${client.email}`,
        `Service: ${inquiry.service_type}`,
        `Budget: ${inquiry.budget || 'Not provided'}`,
        '',
        inquiry.project_description
      ].join('\n'));
    },
    async notifyNewClientMessage(client, sender, message) {
      await send(client.email, 'You have a new BruceMadeThis message', `Hi ${client.first_name || 'there'},\n\n${sender.first_name || 'Bruce Made This'} sent you a message:\n\n${message}\n\nSign in to your client account to reply.`);
    },
    async notifyAdminClientMessage(client, message) {
      await send(config.ADMIN_EMAIL, `New message from ${client.first_name} ${client.last_name}`, `Client: ${client.first_name} ${client.last_name}\nEmail: ${client.email}\n\n${message}`);
    },
    async notifyInquiryStatus(client, inquiry) {
      await send(client.email, `Project inquiry update: ${inquiry.project_title}`, `Your inquiry status is now ${inquiry.status.replaceAll('_', ' ').toLowerCase()}. Sign in to your account for the latest details.`);
    }
  };
}
