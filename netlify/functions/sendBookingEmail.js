const faunadb = require('faunadb');
const nodemailer = require('nodemailer');
const Busboy = require('busboy');
const { Readable } = require('stream');

// FaunaDB client
const client = new faunadb.Client({ secret: process.env.FAUNA_SECRET });
const q = faunadb.query;

exports.handler = async (event) => {
  const busboy = new Busboy({ headers: event.headers });

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      const buffer = [];
      file.on('data', (data) => {
        buffer.push(data);
      }).on('end', () => {
        files.push({
          fieldname,
          originalFilename: filename,
          encoding,
          mimetype,
          buffer: Buffer.concat(buffer)
        });
      });
    });

    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on('finish', async () => {
      // Log the received data
      console.log('Received data:', fields);

      // Save to FaunaDB
      try {
        const dbResponse = await client.query(
          q.Create(
            q.Collection('bookings'), // Ensure this matches your collection name exactly
            { data: fields }
          )
        );
        console.log('FaunaDB Response:', dbResponse);
      } catch (error) {
        console.error('FaunaDB Error:', error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ success: false, error: 'Failed to save booking data' })
        });
        return;
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
        text: `Name: ${fields.name}\nEmail: ${fields.email}\nPhone: ${fields.phone}\nDate: ${fields.selectedDate}\nTime: ${fields.selectedTime}\nAddress: ${fields.address}\nService Type: ${fields.type}\nMessage: ${fields.message}\nPayment Method: ${fields.payment}\nUploaded Images: ${files.length > 0 ? files.map(file => file.originalFilename).join(', ') : 'None'}`,
        attachments: files.map(file => ({
          filename: file.originalFilename,
          content: file.buffer
        }))
      };

      try {
        const emailResponse = await transporter.sendMail(mailOptions);
        console.log('Email Response:', emailResponse);
        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true })
        });
      } catch (error) {
        console.error('Nodemailer Error:', error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ success: false, error: 'Failed to send email' })
        });
      }
    });

    busboy.end(Buffer.from(event.body, 'base64'));
  });
};
