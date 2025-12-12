const Tesseract = require('tesseract.js');
const PDFParser = require('pdf2json');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * OCR Service for extracting text from Certificate of Registration (COR) images
 */
class OCRService {
    /**
     * Extract text from base64 image or PDF using Tesseract OCR or PDF parser
     * @param {string} base64Image - Base64 encoded image or PDF data
     * @returns {Promise<string>} Extracted text
     */
    async extractTextFromImage(base64Image) {
        try {
            // Check if it's a PDF
            if (base64Image.startsWith('data:application/pdf')) {
                // Remove data URL prefix and convert to buffer
                const pdfData = base64Image.replace(/^data:application\/pdf;base64,/, '');
                const buffer = Buffer.from(pdfData, 'base64');

                // Create temporary file
                const tempFilePath = path.join(os.tmpdir(), `cor_${Date.now()}.pdf`);
                fs.writeFileSync(tempFilePath, buffer);

                // Parse PDF
                const pdfParser = new PDFParser();

                const extractedText = await new Promise((resolve, reject) => {
                    pdfParser.on('pdfParser_dataReady', (pdfData) => {
                        try {
                            // Extract text from all pages
                            let fullText = '';
                            if (pdfData.Pages) {
                                pdfData.Pages.forEach(page => {
                                    if (page.Texts) {
                                        page.Texts.forEach(text => {
                                            if (text.R) {
                                                text.R.forEach(r => {
                                                    if (r.T) {
                                                        fullText += decodeURIComponent(r.T) + ' ';
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }

                            // Clean up temp file
                            try {
                                fs.unlinkSync(tempFilePath);
                            } catch (e) {
                                console.warn('Failed to delete temp file:', e);
                            }

                            resolve(fullText);
                        } catch (error) {
                            reject(error);
                        }
                    });

                    pdfParser.on('pdfParser_dataError', (error) => {
                        // Clean up temp file
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (e) {
                            console.warn('Failed to delete temp file:', e);
                        }
                        reject(error);
                    });

                    pdfParser.loadPDF(tempFilePath);
                });

                console.log('PDF text extracted:', extractedText.substring(0, 500));
                return extractedText;
            }

            // Handle images with Tesseract OCR
            const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(imageData, 'base64');

            // Run Tesseract OCR
            const { data: { text } } = await Tesseract.recognize(
                buffer,
                'eng',
                {
                    logger: info => console.log('OCR Progress:', info)
                }
            );

            return text;
        } catch (error) {
            console.error('Text extraction error:', error);
            throw new Error('Failed to extract text from document: ' + error.message);
        }
    }

    /**
     * Extract student number from COR text
     * Looks for patterns like: 2024-00322-LQ-0 (full format) or 2024-12345 (partial)
     * @param {string} text - Extracted text from COR
     * @returns {string|null} Student number or null if not found
     */
    extractStudentNumber(text) {
        // Pattern: YYYY-NNNNN-XX-N (full student ID format)
        const fullPattern = /\b(20\d{2}[-\s]?\d{5}[-\s]?[A-Z]{2}[-\s]?\d)\b/;
        const match = text.match(fullPattern);

        if (match) {
            // Normalize format (remove spaces, ensure hyphens)
            return match[1]
                .replace(/\s/g, '')
                .replace(/(\d{4})(\d{5})([A-Z]{2})(\d)/, '$1-$2-$3-$4');
        }

        // Fallback to partial match (YYYY-NNNNN)
        const partialPattern = /\b(20\d{2}[-\s]?\d{5})\b/;
        const partialMatch = text.match(partialPattern);
        if (partialMatch) {
            return partialMatch[1].replace(/\s/g, '').replace(/(\d{4})(\d{5})/, '$1-$2');
        }

        return null;
    }

    /**
     * Extract name from COR text
     * Looks for common name patterns in COR documents
     * @param {string} text - Extracted text from COR
     * @returns {string|null} Name or null if not found
     */
    extractName(text) {
        console.log('=== Attempting to extract name from COR ===');
        console.log('First 1000 chars of text:', text.substring(0, 1000));

        // Priority 1: Look for "LASTNAME, Firstname Middlename" pattern (most common in PUP COR)
        // This is the most reliable pattern - we saw "GARGANTA, GLASON NEL DUE├æAS" in the logs
        // Note: The name after comma can be all caps or title case
        // Allow any characters in words to capture encoding artifacts like ├æ, plus hyphens and periods
        const lastNameFirstPattern = /([A-Z├æ0-9.-]{2,}[\w├æ0-9.-]+),\s*([\w├æ0-9.-]+(?:\s+[\w├æ0-9.-]+)*)/g;
        let match;
        const candidates = [];

        while ((match = lastNameFirstPattern.exec(text)) !== null) {
            let fullName = match[0].trim();

            // Clean up encoding artifacts
            fullName = fullName
                .replace(/├æ/g, 'Ñ')
                .replace(/[^\w\s,.-]/g, '') // Allow dots and dashes
                .replace(/\s+/g, ' ')
                .trim();

            const words = fullName.split(/[\s,]+/);
            if (words.length >= 2 && words.length <= 5 && fullName.length >= 10 && fullName.length <= 100) {
                const letterCount = (fullName.match(/[a-zA-Z]/g) || []).length;
                const totalChars = fullName.replace(/[\s,.-]/g, '').length;
                if (letterCount / totalChars > 0.9) {
                    candidates.push(fullName);
                }
            }
        }

        if (candidates.length > 0) {
            console.log('Name extracted (LASTNAME, Firstname format):', candidates[0]);
            return candidates[0];
        }

        // Priority 2: Look for all-caps name format "GARGANTA GLASON NEL DUENAS"
        // DISABLED - This pattern was matching course codes and program names instead of actual names
        // The LASTNAME, Firstname pattern above is more reliable
        /*
        const allCapsPattern = /\b([A-Z]{2,}(?:[\s,]+[A-Z├æ]{2,}){2,6})\b/g;
        while ((match = allCapsPattern.exec(text)) !== null) {
            let fullName = match[1].trim();

            // Clean up encoding artifacts (├æ often represents ñ in PDFs)
            fullName = fullName
                .replace(/├æ/g, 'Ñ')
                .replace(/[^\w\s,]/g, '') // Remove non-word chars except spaces and commas
                .replace(/\s+/g, ' ')     // Normalize spaces
                .trim();

            const words = fullName.split(/\s+/);

            // Must be 3-6 words (lastname + firstname + middle names), reasonable length
            if (words.length >= 3 && words.length <= 6 && fullName.length >= 10 && fullName.length <= 100) {
                // Exclude university/institution names and program descriptions
                if (!fullName.includes('UNIVERSITY') && !fullName.includes('POLYTECHNIC') &&
                    !fullName.includes('COLLEGE') && !fullName.includes('CERTIFICATE') &&
                    !fullName.includes('REGISTRATION') && !fullName.includes('SCHEDULE') &&
                    !fullName.includes('SEMESTER') && !fullName.includes('SUBJECT') &&
                    !fullName.includes('BACHELOR') && !fullName.includes('SCIENCE') &&
                    !fullName.includes('TECHNOLOGY') && !fullName.includes('INFORMATION') &&
                    !fullName.includes('PROGRAM') && !fullName.includes('DESCRIPTION')) {
                    console.log('Name extracted (all-caps format):', fullName);
                    return fullName;
                }
            }
        }
        */

        // Priority 3: Try 3rd line if it looks like a name
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        if (lines.length >= 3) {
            const thirdLine = lines[2].trim();
            const words = thirdLine.split(/\s+/);
            if (words.length >= 2 && words.length <= 5 && thirdLine.length >= 10 && thirdLine.length <= 100) {
                const letterCount = (thirdLine.match(/[a-zA-Z]/g) || []).length;
                const totalChars = thirdLine.replace(/\s/g, '').length;
                if (letterCount / totalChars > 0.9 && !thirdLine.includes('UNIVERSITY') && !thirdLine.includes('POLYTECHNIC')) {
                    console.log('Name extracted from 3rd line:', thirdLine);
                    return thirdLine;
                }
            }
        }

        console.log('No name found in COR');
        return null;
    }

    /**
     * Fuzzy match two names (handles different formats)
     * @param {string} name1 - First name
     * @param {string} name2 - Second name
     * @returns {boolean} True if names match
     */
    fuzzyNameMatch(name1, name2) {
        if (!name1 || !name2) return false;

        // Normalize: lowercase, remove extra spaces, remove punctuation (keeping alphanumeric only for robust comparison)
        const normalize = (str) => str.toLowerCase()
            .replace(/[,\.]/g, '') // Remove punctuation for comparison
            .replace(/[-]/g, ' ')   // Treat hyphens as spaces
            .replace(/[^a-z0-9\sñ]/g, '') // Keep alphanumeric and spaces (and ñ)
            .replace(/\s+/g, ' ')
            .trim();

        const n1 = normalize(name1);
        const n2 = normalize(name2);

        // Direct match
        if (n1 === n2) return true;

        // Split into words and check if all words from one name appear in the other
        const words1 = n1.split(' ');
        const words2 = n2.split(' ');

        // Check if all significant words (length > 2) match
        const significantWords1 = words1.filter(w => w.length > 2);
        const significantWords2 = words2.filter(w => w.length > 2);

        const allWordsMatch = significantWords1.every(word =>
            significantWords2.some(w => w.includes(word) || word.includes(w))
        );

        return allWordsMatch;
    }

    /**
     * Verify Certificate of Registration
     * @param {string} corImage - Base64 encoded COR image
     * @param {Object} studentData - Student data to verify against
     * @param {string} studentData.studentId - Expected student ID
     * @param {string} studentData.firstName - Expected first name
     * @param {string} studentData.middleName - Expected middle name (optional)
     * @param {string} studentData.lastName - Expected last name
     * @param {string} studentData.course - Expected course (Full Name)
     * @param {string|number} studentData.yearLevel - Expected year level
     * @returns {Promise<Object>} Verification result
     */
    async verifyCOR(corImage, studentData) {
        try {
            // Extract text from COR
            const extractedText = await this.extractTextFromImage(corImage);

            console.log('Extracted COR text:', extractedText.substring(0, 500));

            // Extract student number
            const extractedStudentNumber = this.extractStudentNumber(extractedText);

            // Extract name
            const extractedName = this.extractName(extractedText);

            // Extract Course & Year
            const extractedCourse = this.extractCourse(extractedText);
            const extractedYear = this.extractYear(extractedText);

            // Build full name from student data (with middle name if provided)
            const fullName = studentData.middleName
                ? `${studentData.firstName} ${studentData.middleName} ${studentData.lastName}`
                : `${studentData.firstName} ${studentData.lastName}`;

            // Validate student number
            const studentNumberMatch = extractedStudentNumber === studentData.studentId;

            // Validate name (fuzzy match)
            const nameMatch = extractedName ?
                this.fuzzyNameMatch(extractedName, fullName) : false;

            // Validate Course
            const courseMatch = extractedCourse && studentData.course ?
                (extractedCourse.toLowerCase().includes(studentData.course.toLowerCase()) || studentData.course.toLowerCase().includes(extractedCourse.toLowerCase()))
                : undefined;

            // Validate Year
            const yearMatch = extractedYear && studentData.yearLevel ?
                extractedYear.toString() === studentData.yearLevel.toString()
                : true;

            // Check if document looks like a COR
            const hasCORIndicators = /certificate|registration|enrollment|semester|subject/i.test(extractedText);

            const validations = {
                studentNumberMatch,
                nameMatch,
                hasCORIndicators,
                courseMatch,
                yearMatch,
                extractedStudentNumber,
                extractedName,
                extractedCourse,
                extractedYear,
                extractedText: extractedText.substring(0, 1000) // Store first 1000 chars for audit
            };

            // Determine if valid
            // Require Student ID + Name + COR Indicators. 
            // If Course/Year extracted, check them. If not extracted, assume okay (OCR limitation).
            const isValid = studentNumberMatch && (nameMatch || !extractedName) && hasCORIndicators && (extractedCourse ? courseMatch !== false : true) && (extractedYear ? yearMatch !== false : true);

            return {
                valid: isValid,
                confidence: isValid ? 0.9 : 0.3,
                reason: isValid ? 'COR verified successfully' : this.getFailureReason(validations),
                details: validations
            };

        } catch (error) {
            console.error('COR verification error:', error);
            console.error('Error stack:', error.stack);
            return {
                valid: false,
                confidence: 0,
                reason: 'Failed to process COR document: ' + error.message,
                error: error.message,
                details: {
                    errorType: error.name,
                    errorStack: error.stack
                }
            };
        }
    }

    /**
     * Get human-readable failure reason
     * @param {Object} validations - Validation results
     * @returns {string} Failure reason
     */
    getFailureReason(validations) {
        if (!validations.studentNumberMatch) {
            return `Student number mismatch. Found: ${validations.extractedStudentNumber || 'none'}`;
        }
        if (!validations.nameMatch && validations.extractedName) {
            return `Name mismatch. Found: ${validations.extractedName}`;
        }
        if (!validations.hasCORIndicators) {
            return 'Document does not appear to be a valid Certificate of Registration';
        }
        if (validations.extractedCourse && validations.courseMatch === false) {
            return `Course mismatch. Found: ${validations.extractedCourse}`;
        }
        if (validations.extractedYear && validations.yearMatch === false) {
            return `Year Level mismatch. Found: ${validations.extractedYear}`;
        }
        return 'COR verification failed';
    }

    /**
     * Extract course from COR text
     * @param {string} text - Extracted text
     * @returns {string|null} Matches full course name
     */
    extractCourse(text) {
        // Look for keywords matching known courses
        const patterns = [
            /Bachelor of Science in Information Technology/i,
            /BS Information Technology/i,
            /BSIT/i,
            /Diploma in Information Technology/i,
            /Diploma in IT/i,
            /DIT/i,
            /Bachelor of Science in Office Administration/i,
            /BS Office Administration/i,
            /BSOA/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const matched = match[0].toLowerCase();
                // Normalize to full name
                if (matched.includes('information technology') && matched.includes('bachelor')) return 'Bachelor of Science in Information Technology';
                if (matched.includes('office administration')) return 'Bachelor of Science in Office Administration';
                if (matched.includes('diploma')) return 'Diploma in Information Technology';
                if (matched === 'bsit') return 'Bachelor of Science in Information Technology';
                if (matched === 'bsoa') return 'Bachelor of Science in Office Administration';
                if (matched === 'dit') return 'Diploma in Information Technology';

                return match[0];
            }
        }
        return null;
    }

    /**
     * Extract year level from COR text
     * @param {string} text - Extracted text
     * @returns {string|null} Year level as string
     */
    extractYear(text) {
        const patterns = [
            /\b(1st|First)\s+Year\b/i,
            /\b(2nd|Second)\s+Year\b/i,
            /\b(3rd|Third)\s+Year\b/i,
            /\b(4th|Fourth)\s+Year\b/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const y = match[1].toLowerCase();
                if (y.startsWith('1') || y === 'first') return '1';
                if (y.startsWith('2') || y === 'second') return '2';
                if (y.startsWith('3') || y === 'third') return '3';
                if (y.startsWith('4') || y === 'fourth') return '4';
            }
        }
        return null;
    }
}

module.exports = new OCRService();
