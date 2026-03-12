const PDFDocument = require('pdfkit');
const fs = require('fs');

async function generateCertificatePDF(certificateData, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const stream = fs.createWriteStream(outputPath);

            doc.pipe(stream);

            // Header
            doc.fontSize(24).fillColor('#2563A8').text('GRAM PANCHAYAT', { align: 'center' });
            doc.fontSize(18).text('GOVERNMENT CERTIFICATE', { align: 'center' });
            doc.moveDown();

            // Certificate border
            doc.rect(40, 120, doc.page.width - 80, doc.page.height - 200).stroke();

            // Certificate content
            doc.fontSize(14).fillColor('#000');
            doc.moveDown();
            doc.text(`Certificate Number: ${certificateData.certificate_number}`, { align: 'left' });
            doc.text(`Issue Date: ${new Date(certificateData.issue_date).toLocaleDateString('en-IN')}`, { align: 'left' });
            doc.moveDown();

            doc.fontSize(16).text(`${certificateData.service_name}`, { align: 'center', underline: true });
            doc.moveDown();

            doc.fontSize(12);
            doc.text(`This is to certify that ${certificateData.user_name}`, { align: 'left' });
            doc.text(`having Aadhar No: ${certificateData.aadhar_number}`, { align: 'left' });
            doc.text(`residing at ${certificateData.address}`, { align: 'left' });
            doc.text(`${certificateData.village}, ${certificateData.district}, ${certificateData.state}`, { align: 'left' });
            doc.moveDown();

            doc.text('This certificate is issued based on the records available with this office.', { align: 'left' });
            doc.moveDown(2);

            // Footer
            doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 400, doc.page.height - 150);
            doc.moveDown();
            doc.text('Authorized Signatory', 400, doc.page.height - 100);
            doc.text('Gram Panchayat Office', 400, doc.page.height - 80);

            doc.end();

            stream.on('finish', () => {
                resolve(outputPath);
            });

            stream.on('error', (err) => {
                reject(err);
            });
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    generateCertificatePDF
};
