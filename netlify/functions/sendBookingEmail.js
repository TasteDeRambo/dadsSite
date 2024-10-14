const faunadb = require('faunadb');
const nodemailer = require('nodemailer');
const AWS = require('aws-sdk');
const busboy = require('busboy');
const fs = require('fs');
const path = require('path');

// FaunaDB client
const client = new faunadb.Client({
  secret: process.env.FAUNA_SECRET
});

const s3 = new AWS.S3();

const q = faunadb.query;

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  const busboy = new busboy({ headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] } });
  const fields = {};
  const files = [];
  const uploads = [];

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    const saveTo = path.join('/tmp', path.basename(filename));
    const stream = fs.createWriteStream(saveTo);
    file.pipe(stream);
    files.push({ filename, path: saveTo, mimetype });

    uploads.push(new Promise((resolve, reject) => {
      stream.on('close', () => {
        s3.upload({
          Bucket: 'YOUR_S3_BUCKET_NAME',
          Key: `uploads/${filename}`,
          Body: fs.createReadStream(saveTo),
          ContentType: mimetype
        }, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
    }));
  });

  busboy.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  busboy.on('finish', async () => {
    await Promise.all(uploads);

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
      images: files.map(file => ({
        filename: file.filename,
        path: `uploads/${file.filename}`,
        mimetype: file.mimetype
      }))
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
  });

  busboy.end(Buffer.from(event.body, 'base64'));
};
