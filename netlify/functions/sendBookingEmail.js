const faunadb = require('faunadb');
const nodemailer = require('nodemailer');

// FaunaDB client
const client = new faunadb.Client({
  secret: 'fnAFXlEltRAASacUr_LudawtkoweIlm11bbAiOfD'
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

  // Save to FaunaDB
  try {
    await client.query(
      q.Create(
        q.Collection('bookings'),
        { data }
      )
    );
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
      user: 'kevalcantara2005@gmail.com',
      pass: 'Alcantara2005'
    }
  });

  const mailOptions = {
    from: 'YOUR_EMAIL@gmail.com',
    to: 'YOUR_EMAIL@gmail.com',
    subject: 'New Booking',
    text: `Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Date: ${data.selectedDate}
Time: ${data.selectedTime}
Address: ${data.address}`
  };

  try {
    await transporter.sendMail(mailOptions);
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
