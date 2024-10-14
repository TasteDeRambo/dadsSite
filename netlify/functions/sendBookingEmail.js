const faunadb = require('faunadb');
const nodemailer = require('nodemailer');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

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

  const form = new formidable.IncomingForm({ multiples: true });
  form.uploadDir = '/tmp';

  const formData = await new Promise((resolve, reject) => {
    form.parse({ 
      headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] },
      payload: Buffer.from(event.body, 'base64')
    }, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });

  const data = {
    name: formData.fields.name,
    email: formData.fields.email,
    phone: formData.fields.phone,
    selectedDate: formData.fields.selectedDate,
    selectedTime: formData.fields.selectedTime,
    address: formData.fields.address,
    type: formData.fields.type,
    message: formData.fields.message,
    payment: formData.fields.payment,
    images: formData.files.images ? (Array.isArray(formData.files.images) ? formData.files.images : [formData.files.images]) : []
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
    path: image.path,
    contentType: image.mimetype
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

