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

  return new Promise((resolve, reject) => {
    form.parse(event, async (err, fields, files) => {
      if (err) {
        reject({ statusCode: 500, body: 'Failed to parse form' });
        return;
      }

      const data = fields;
      const images = files.images;

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
        text: `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone}\nDate: ${data.selectedDate}\nTime: ${data.selectedTime}\nAddress: ${data.address}\nService Type: ${data.type}\nMessage: ${data.message}\nPayment Method: ${data.payment}\nUploaded Images: ${images ? images.map(file => file.originalFilename).join(', ') : 'None'}`,
        attachments: images.map(file => ({
          filename: file.originalFilename,
          path: file.path
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
  });
};
