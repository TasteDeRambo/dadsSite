const faunadb = require('faunadb');
const nodemailer = require('nodemailer');

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

  const data = JSON.parse(event.body);

  // Log the received data
  console.log('Received data:', data);

  // Save to FaunaDB
  try {
    const dbResponse = await client.query(
      q.Create(
        q.Collection('bookings'), // Ensure this matches your collection name exactly
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
Uploaded Images: ${data.images ? data.images.join(', ') : 'None'}` // Keeping image names if any
  };

  try {
    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Email Response:', emailResponse);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Nodemailer Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to send email' })
    };
  }
};
