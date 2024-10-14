const faunadb = require('faunadb');
const nodemailer = require('nodemailer');
const multiparty = require('multiparty');

// FaunaDB client
const client = new faunadb.Client({
  secret: process.env.FAUNA_SECRET
});

const q = faunadb.query;

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  const form = new multiparty.Form();
  const formData = await new Promise((resolve, reject) => {
    form.parse(event, (error, fields, files) => {
      if (error) reject(error);
      resolve({ fields, files });
    });
  });

  const data = {
    name: formData.fields.name[0],
    email: formData.fields.email[0],
    phone: formData.fields.phone[0],
    selectedDate: formData.fields.selectedDate[0],
    selectedTime: formData.fields.selectedTime[0],
    address: formData.fields.address[0],
    type: formData.fields.type[0],
    message: formData.fields.message[0],
    payment: formData.fields.payment[0],
    images: formData.files.images || [] // Handle file uploads
  };

  // Log the received data
  console.log('Received data:', data);

  // Save to FaunaDB
  try {
    const dbResponse = await client.query(
      q.Create(
        q.Collection('bookings'),
        { data }
      )
    );
    console.log('FaunaDB Response:', dbResponse);
  } catch (error) {
    console.error('FaunaDB Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to save booking data' })
    };
  }

  // Send email using Nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const attachments = data.images.map(image => ({
    filename: image.originalFilename,
    path: image.path
  }));

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: 'New Booking',
    text: `Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Date: ${data.selectedDate}
Time: ${data.selectedTime}
Address: ${data.address}
Service Type: ${data.type}
Message: ${data.message}
Payment Method: ${data.payment}
Uploaded Images: ${data.images.map(image => image.originalFilename).join(', ')}`,
    attachments
  };

  try {
    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Email Response:', emailResponse);
  } catch (error) {
    console.error('Nodemailer Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to send email' })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
