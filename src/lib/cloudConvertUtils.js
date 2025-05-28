import CloudConvert from 'cloudconvert';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import * as constants from '@/constants';

// Initialize CloudConvert client
const cloudConvert = new CloudConvert(constants.CLOUDCONVERT_API_KEY);

/**
 * Converts a DWG file to DXF format using CloudConvert API
 * @param {string} inputFilePath - Path to the DWG file
 * @param {string} outputDir - Directory to save the converted DXF file
 * @param {string} fileName - Original file name (without extension)
 * @returns {Promise<string>} - Path to the converted DXF file
 */
export async function convertDwgToDxf(inputFilePath, outputDir, fileName) {
  try {
    console.log(`[CloudConvert] Starting conversion of ${fileName} from DWG to DXF...`);
    
    // Create a job with import/upload, convert, and export/url tasks
    const job = await cloudConvert.jobs.create({
      tasks: {
        'import-file': {
          operation: 'import/upload'
        },
        'convert-file': {
          operation: 'convert',
          input: 'import-file',
          output_format: 'dxf'
        },
        'export-file': {
          operation: 'export/url',
          input: 'convert-file'
        }
      }
    });

    // Get the upload task
    const uploadTask = job.tasks.find(task => task.name === 'import-file');
    
    // Upload the file
    const inputFile = await fs.readFile(inputFilePath);
    await cloudConvert.tasks.upload(uploadTask, inputFile, path.basename(inputFilePath));
    
    // Wait for job completion
    const finishedJob = await cloudConvert.jobs.wait(job.id);
    
    // Get the export URL
    const exportTask = finishedJob.tasks.find(task => task.name === 'export-file');
    const file = exportTask.result.files[0];
    
    // Create output file path
    const outputFilePath = path.join(outputDir, `${fileName}.dxf`);
    
    // Download the converted file
    await downloadFile(file.url, outputFilePath);
    
    console.log(`[CloudConvert] Successfully converted ${fileName} to DXF`);
    return outputFilePath;
  } catch (error) {
    console.error(`[CloudConvert] Error converting DWG to DXF:`, error);
    throw error;
  }
}

/**
 * Downloads a file from a URL to a local path
 * @param {string} url - URL to download from
 * @param {string} outputPath - Path to save the file
 * @returns {Promise<void>}
 */
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      response.pipe(writeStream);
      
      writeStream.on('finish', () => {
        writeStream.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath).catch(() => {}); // Delete the file if download fails
      reject(err);
    });
    
    writeStream.on('error', (err) => {
      fs.unlink(outputPath).catch(() => {}); // Delete the file if write fails
      reject(err);
    });
  });
}