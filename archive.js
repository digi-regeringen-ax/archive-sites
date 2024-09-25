import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import {URL} from 'url';
import PDFDocument from "pdfkit";
import sizeOf from 'image-size';
import * as pdfLib from 'pdf-lib';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
    .option('url', {
        alias: 'u',
        type: 'string',
        description: 'URL of the site to archive (without http(s)://',
    })
    .option('chunk_size', {
        alias: 'c',
        type: 'number',
        default: 50,
        description: 'Size of the chunks',
    })
    .option('images_path', {
        alias: 'i',
        type: 'string',
        default: '__png__',
        description: 'Name of the subdirectory where to store PNGs',
    })
    .option('chunks_path', {
        alias: 'cp',
        type: 'string',
        default: '__chunks__',
        description: 'Name of the subdirectory where to store the chunks',
    })

    .option('all_pages_filename', {
        alias: 'a',
        type: 'string',
        default: 'all_pages.pdf',
        description: 'Name of the file that holds all the pages',
    })
    .argv;

console.log('Parameters: ', argv);

if(!argv.url) {
    console.error('No URL given');
    process.exit();
}

/*
    CONFIGURATION -- START
 */

const needsLogin = {
    // user: 'abc',
    // password: 'def'
}

/*
    CONFIGURATION -- END
 */


const DOMAIN = `https://${argv.url}`;

// Function to ensure the directory structure for the given URL path exists
const createDirectoryFromUrl = async (urlString) => {
    // Parse the URL to get the pathname
    const urlPath = new URL(urlString).pathname;

    // Convert URL pathname to a local file path
    const filePath = path.join(process.cwd(), `/${argv.url}/`, urlPath);

    // Check if the directory already exists, if not create it
    return new Promise((resolve, reject) => {
        fs.mkdir(filePath, {recursive: true}, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(filePath);
            }
        });
    });
};

async function splitPdf(pdfPath, chunkSize = 30, outputDir = './outputChunks') {
    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    // Load the PDF file
    const existingPdfBytes = fs.readFileSync(pdfPath);

    // Load the PDF using pdf-lib
    const pdfDoc = await pdfLib.PDFDocument.load(existingPdfBytes);
    const totalPages = pdfDoc.getPageCount();

    // Split the PDF into chunks of 30 pages
    for (let i = 0; i < totalPages; i += chunkSize) {
        const endPage = Math.min(i + chunkSize, totalPages);
        const chunkDoc = await pdfLib.PDFDocument.create();

        // Copy the chunk of pages to the new document
        const pages = await chunkDoc.copyPages(pdfDoc, Array.from({length: endPage - i}, (_, idx) => i + idx));
        pages.forEach((page) => {
            chunkDoc.addPage(page);
        });

        // Serialize the chunk PDF to bytes
        const pdfBytes = await chunkDoc.save();

        // Define the output file name
        const chunkFileName = `${outputDir}/chunk-${Math.floor(i / chunkSize) + 1}.pdf`;

        // Write the chunk to disk
        fs.writeFileSync(chunkFileName, pdfBytes);
        console.log(`Written chunk: ${chunkFileName}`);
    }
}


(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(DOMAIN);

    const findUniqueItems = (array1, array2) => {
        return array1.filter(item => !array2.includes(item));
    };

    let allUrls = [];

    const joinUnique = (array1, array2) => {
        return [...new Set([...array1, ...array2])];
    };

    const urlToSlug = (url) => {
        return url
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')           // Replace spaces with -
            .replace(/[^\w\-]+/g, '-')       // Remove all non-word chars
            .replace(/\-\-+/g, '-');        // Replace multiple - with single -
    };

    const checkUrl = (inputString, prefix, invalidExtensions) => {
        const startsWithPrefix = inputString.startsWith(prefix);
        const endsWithInvalidExtension = invalidExtensions.some(extension => inputString.endsWith(`.${extension}`));

        return startsWithPrefix && !endsWithInvalidExtension
            && !inputString.includes("user?destination=")
            && !inputString.includes("?report=")
            && !inputString.includes("logout")
            && !inputString.includes("loggaut");
    };

    const doc = new PDFDocument({autoFirstPage: false});

    function printImageAcrossPages(imagePath, pdfPath) {

        const dimensions = sizeOf(imagePath);
        const doc2 = new PDFDocument({autoFirstPage: false});

        // A4 dimensions in points at 72 DPI
        const pageWidth = 595.28;
        const pageHeight = 800;

        // Calculate the scale to fit the image width to A4 page width
        const scaleFactor = pageWidth / dimensions.width;
        const scaledImageHeight = dimensions.height * scaleFactor;

        // Determine the number of pages needed based on the scaled image height and A4 page height
        const numberOfPages = Math.ceil(scaledImageHeight / pageHeight);

        for (let i = 0; i < numberOfPages; i++) {
            doc.addPage({size: 'A4', margin: 0});
            doc2.addPage({size: 'A4', margin: 0});

            // Calculate the Y position to start drawing the image portion from, taking into account the scaling
            const yPos = -i * pageHeight;

            doc2.image(imagePath, 0, yPos, {
                width: pageWidth, // Scale the image to fit the page width
                // No need to set the height; it will automatically scale proportionally
            });

            doc.image(imagePath, 0, yPos, {
                width: pageWidth, // Scale the image to fit the page width
                // No need to set the height; it will automatically scale proportionally
            });
        }

        // Pipe the output to a file
        doc2.pipe(fs.createWriteStream(pdfPath));

        // Finalize the document
        doc2.end();

    }

    let cntr = 0;

    let cookies;

    if (needsLogin?.password && needsLogin.user) {
        await page.type('#edit-name', needsLogin.user);
        await page.type('#edit-pass', needsLogin.password);
        await page.click('#edit-submit');
        cookies = await page.cookies();
    }

    // Function to crawl a URL up to a specified depth
    async function crawl(url, depth = 10, tmpCntr = 1, newLinksLength = 0) {
        if (depth === 0) {
            return;
        }

        cntr++;
        console.log(`Crawling ${cntr}/${allUrls.length}: ${tmpCntr}/${newLinksLength}: ${url} at depth: ${10 - depth}`);

        try {
            if (needsLogin?.password && needsLogin.user) {
                await page.setCookie(...cookies);
            }

            await page.setViewport({width: 1280, height: 10});

            await page.goto(url, {waitUntil: 'networkidle0'});

            let thisPath = await createDirectoryFromUrl(url);

            await page.screenshot({
                path: `${thisPath}/${urlToSlug(url)}.png`,
                fullPage: true,
            });
            await page.screenshot({
                path: `${argv.url}/${argv.images_path}/${urlToSlug(url)}.png`,
                fullPage: true,
            });

            // await page.pdf({
            //     path: `${thisPath}/${urlToSlug(url)}.pdf`,
            //     format: 'A4',
            //     printBackground: true
            // });

            printImageAcrossPages(`${thisPath}/${urlToSlug(url)}.png`, `${thisPath}/${urlToSlug(url)}.pdf`);

            const links = await page.$$eval('a', as => as.map(a => a.href));

            const sameDomainLinks = links
                .map(link => {
                    link = link.split('#')[0];
                    if (link.startsWith('/')) {
                        console.log('Appended to', link);
                        link = `${DOMAIN}${link}`;
                    }
                    return link;
                })
                .filter(link => checkUrl(link, DOMAIN, [
                    'pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx'
                ]));

            const newLinks = findUniqueItems(sameDomainLinks, allUrls)

            allUrls = joinUnique(allUrls, newLinks);

            let tmpCntr = 0;
            for (let link of newLinks) {
                tmpCntr++;
                await crawl(link, depth - 1, tmpCntr, newLinks.length);
            }

        } catch (error) {
            console.error(`Failed to crawl ${url}: ${error}`);
        }
    }

    await createDirectoryFromUrl(DOMAIN)
    await createDirectoryFromUrl(`${DOMAIN}/${argv.images_path}`);

    // Start crawling from the root URL up to 10 levels deep
    await crawl(DOMAIN, 10);
    // Pipe the output to a file
    doc.pipe(fs.createWriteStream(`${argv.url}/${argv.all_pages_filename}`));

    // Finalize the document
    doc.end();

    await browser.close();

    await splitPdf(`${argv.url}/${argv.all_pages_filename}`, argv.chunk_size, `${argv.url}/${argv.chunks_path}`)

})();

