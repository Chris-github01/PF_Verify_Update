# EmailJS Setup Guide

The demo registration system now uses EmailJS instead of SendGrid for sending welcome emails.

## Required Environment Variables

You need to configure these environment variables in your Supabase Edge Functions:

```bash
EMAILJS_SERVICE_ID=your_service_id
EMAILJS_TEMPLATE_ID=your_template_id
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key (optional but recommended for server-side)
```

## Setup Steps

### 1. Create EmailJS Account
1. Go to [EmailJS.com](https://www.emailjs.com/)
2. Sign up for a free account
3. Verify your email address

### 2. Add Email Service
1. Go to "Email Services" in your EmailJS dashboard
2. Click "Add New Service"
3. Choose your email provider (Gmail, Outlook, etc.)
4. Connect and authorize your email account
5. Note down the **Service ID**

### 3. Create Email Template
1. Go to "Email Templates" in your dashboard
2. Click "Create New Template"
3. Set up your template with these variables:
   - `{{to_email}}` - Recipient email
   - `{{to_name}}` - Recipient name
   - `{{subject}}` - Email subject
   - `{{html_content}}` - The HTML email body
   - `{{company}}` - Company name
   - `{{reply_to}}` - Reply-to email address

**Important Template Configuration:**
- **To Email:** `{{to_email}}`
- **From Name:** PassiveFire Verify+
- **Subject:** `{{subject}}`
- **Content:** `{{{html_content}}}` (use triple braces to render HTML)
- **Reply To:** `{{reply_to}}`

4. Save the template and note down the **Template ID**

### 4. Get API Keys
1. Go to "Account" in your dashboard
2. Find your **Public Key** (User ID)
3. Generate a **Private Key** (recommended for server-side use)

### 5. Configure Supabase Environment Variables

Set the environment variables in your Supabase project:

```bash
# Using Supabase CLI
supabase secrets set EMAILJS_SERVICE_ID=your_service_id
supabase secrets set EMAILJS_TEMPLATE_ID=your_template_id
supabase secrets set EMAILJS_PUBLIC_KEY=your_public_key
supabase secrets set EMAILJS_PRIVATE_KEY=your_private_key
```

Or set them in the Supabase Dashboard:
1. Go to Project Settings > Edge Functions
2. Add the environment variables there

## Testing

Once configured, test the email system by:
1. Registering a new demo account
2. Check the edge function logs for any errors
3. Verify the email is received

## Fallback Behavior

If EmailJS is not configured, the function will:
- Log a warning to the console
- Print the email content to the logs
- Return success without failing the registration

This allows demo accounts to be created even if email is not working.

## EmailJS Free Tier Limits

- 200 emails per month
- Basic email services
- Template editor
- Email history

For production use with higher volume, consider upgrading to a paid plan.

## Troubleshooting

### Email not sending
- Check that all environment variables are set correctly
- Verify your EmailJS service is connected and active
- Check the edge function logs for error messages

### Emails going to spam
- Use a verified email domain
- Add SPF/DKIM records to your domain
- Consider using a professional email service for production

### Template not rendering HTML
- Make sure you use triple braces `{{{html_content}}}` in the template
- Verify the template variables match the payload
