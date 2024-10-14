const faunadb = require('faunadb');
const nodemailer = require('nodemailer');
const Busboy = require('busboy');
const { promises: fs } = require('fs');
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

  const busboy = new Busboy({ headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] } });
  const fields = {};
  const files = [];

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    const saveTo = path.join('/tmp', path.basename(filename));
    file.pipe(fs.createWriteStream(saveTo));
    files.push({ filename, path: saveTo, mimetype });
  });

  busboy.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  busboy.on('finish', () => {
    const data = {
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      selectedDate: fields.selectedDate,
      selectedTime: fields.selectedTime,
      address: fields.address,
      type: fields.type,
      message: fields.message,
      payment: fields.payment,
      images: files
    };

    // Log the received data
    console.log('Received data:', data);

    // Save to FaunaDB
    client.query(
      q.Create(
        q.Collection('bookings'),
        { data }
      )
    ).then(dbResponse => {
      console.log('FaunaDB Response:', dbResponse);
      // Send email using Nodemailer
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const attachments = data.images.map(image => ({
        filename: image.filename,
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
Uploaded Images: ${data.images.map(image => image.filename).join(', ')}`,
        attachments
      };

      return transporter.sendMail(mailOptions);
    }).then(emailResponse => {
      console.log('Email Response:', emailResponse);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    }).catch(error => {
      console.error('Error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: 'Failed to send email or save booking data' })
      };
    });
  });

  busboy.end(Buffer.from(event.body, 'base64'));
};
