/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {TextDocument, CancellationToken, DocumentFormattingEditProvider, FormattingOptions, ProviderResult, TextEdit, Range } from 'vscode';

export class PddlFormatProvider implements DocumentFormattingEditProvider {

    constructor() {
    }

    provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]> {
        if (token.isCancellationRequested) {
            return null;
        }
        console.log(`${document} ${options} ${token}`);

		// NEW ALGORITHM
		// note: user is free to define spacing within comments
		// note: array of boolean values was originally used to determine location within file
		//			replaced by string since arrays cannot be switched over

		// note: predicate and function formatting buggy
		// 			action formatting to be completed

        // beg, sigreq, typ, prefun, act
        let stateString = "beg";

        // logical state array to determine location with respect to syntax - [com, fir, ope, req, inh, nes]
        var logicalState: boolean[];
        logicalState = [false, false, null, false, false, false];

        let selection = document.getText();
        let textArray = selection.split('');
        let formattedText = "";

        let tabRegEx = new RegExp('[\t]');
        let newLineRegEx = new RegExp('[\r\n]');
		let alphaRegEx = new RegExp('[a-zA-Z]');
		let numRegEx = new RegExp('[0-9]');

        for (let i = 0; i < textArray.length; i++) {

			// alphabet, number or question mark
            if (alphaRegEx.test(textArray[i]) || numRegEx.test(textArray[i]) || textArray[i] === '?') {
                formattedText += textArray[i];
                continue;
			}
			// semicolon for comment
            if (textArray[i] === ';') {
                logicalState[0] = true;
                formattedText += textArray[i];
                continue;
			}
			if (textArray[i] === '-') {
				if (stateString === "typ") {
					logicalState[4] = true;					
				}
				formattedText += textArray[i];
				continue;
			}
			// opening bracket
            if (textArray[i] === '(') {
				// not a comment and first bracket
                if (logicalState[0] !== true && logicalState[1] !== true) {
                    stateString = "sigreq";
                    logicalState[1] = true; 
				}
				// not a comment and not first bracket and first bracket of a pair
                else if (logicalState[0] !== true && logicalState[1] === true && logicalState[2] !== true) {
                    logicalState[2] = true;
				}
				// not a comment and nested brackets
				else if (logicalState[0] !== true && logicalState[2] === true) {
					logicalState[5] = true;
				}
                formattedText += textArray[i];
                continue;
			}
			// closing bracket
			if (textArray[i] === ')') {
				// not a comment and closing bracket of an already open one
				if (logicalState[0] !== true && logicalState[2] === true) {
					formattedText += textArray[i];
					if (logicalState[5] !== true) {
						logicalState[2] = false;
						// no whitespace after closing bracket
						if (!(tabRegEx.test(textArray[i+1]) || newLineRegEx.test(textArray[i+1]) || textArray[i+1] === ' ')) {
							if (textArray[i+1] === ';') {
								formattedText += ' ';
							}
							else {
								formattedText += '\n' + '\n' + '\t';
							}
						}
						if (logicalState[3] === true) {
							logicalState[3] = false;
						}
						continue;						
					}
					else {
						logicalState[5] = false;
						if (!(tabRegEx.test(textArray[i+1]) || newLineRegEx.test(textArray[i+1]) || textArray[i+1] === ' ')) {
							formattedText += '\n' + '\t' + '\t' + '\t' + '\t' + '\t';
						}
						continue;
					}
				}
				formattedText += textArray[i];
				continue;
			}
			// colon, post-colon whitespace and stateString setting
			if (textArray[i] === ':') {
				formattedText += ':';
				i = skipWhiteSpace(i);
				if (logicalState[3] !== true) {
					switch (textArray[i+1]) {
						case 'r':
							stateString = "sigreq";
							logicalState[3] = true;		
							break;
						case 't':
							stateString = "typ";
							break;
						case 'p' || 'f':
							stateString = "prefun";
							break;
						case 'd' || 'a':
							stateString = "act";
							break;
						default:
							stateString = "sigreq";
							break;
					}			
				}
				continue;
			}

			// white space
            if (tabRegEx.test(textArray[i]) || newLineRegEx.test(textArray[i]) || textArray[i] === ' ') {
                switch (stateString) {
					// begin
                    case "beg":
						// comment
                        if (logicalState[0] === true) {
							i = handleCommentWhiteSpace(i);
                        }
						break;
					// signature or requirements
                    case "sigreq":
						// comment
                        if (logicalState[0] === true) {
							i = handleCommentWhiteSpace(i);
							break;
                        }
						// before or after bracket pair opened
						if (logicalState[2] !== false) {
							i = handleBracketPairWhiteSpace(i);
						}
						// after bracket pair closed
						else {
							i = handlePostBracketPairWhiteSpace(i);
						}
						break;
					// types
                    case "typ":
						// comment
                        if (logicalState[0] === true) {
							i = handleCommentWhiteSpace(i);
							break;
                        }
						// before or after bracket pair opened
						if (logicalState[2] !== false) {
							if (logicalState[4] !== true || textArray[i-1] === '-') {
								i = handleBracketPairWhiteSpace(i);								
							}
							else {
								i = skipWhiteSpace(i);
								logicalState[4] = false;
								if (textArray[i+1] === ')') {
									break;
								}
								formattedText += '\n' + '\t' + '\t' + '\t';
							}
						}
						// after bracket pair closed
						else {
							i = handlePostBracketPairWhiteSpace(i);
						}
						break;
					// predicates or functions
                    case "prefun":
						// comment
                        if (logicalState[0] === true) {
							i = handleCommentWhiteSpace(i);
							break;
                        }
						// before or after bracket pair opened
						if (logicalState[2] !== false) {
							if (logicalState[5] === true) {
								i = handleBracketPairWhiteSpace(i);
							}
							else {
								i = skipWhiteSpace(i);
								if (textArray[i+1] = ')') {
									break;
								}
								formattedText += '\n' + '\t' + '\t' + '\t' + '\t' + '\t';
							}
						}
						// after bracket pair closed
						else {
							i = handlePostBracketPairWhiteSpace(i);
						}
						break;
					// actions
                    case "act":
                        break;
                    default:
                        console.log("I'm lost!");
                }
            }
        }

        let invalidRange = new Range(0, 0, document.lineCount /*intentionally missing the '-1' */, 0);
        let fullRange = document.validateRange(invalidRange);
        
		return [TextEdit.replace(fullRange, formattedText)];
		
		// function to remove whitespace
		function skipWhiteSpace(i: number): number {
			while (tabRegEx.test(textArray[i+1]) || newLineRegEx.test(textArray[i+1]) || textArray[i+1] === ' ') {
				i++;
			}
			return i;
		}

		// function to handle comment whitespace
		function handleCommentWhiteSpace(i:number): number {
			// newline exiting comment
			if (newLineRegEx.test(textArray[i])) {
				logicalState[0] = false;
				i = skipWhiteSpace(i);
				// multiple comments
				if (textArray[i+1] === ';') {
					formattedText += '\n';
				}
				else {
					formattedText += '\n' + '\n';
				}
				if (stateString !== "beg") {
					formattedText += '\t';
				}
			}
			// space or tab
			else {
				formattedText += textArray[i];
			}
			return i;
		}

		// function to handle padding around opening and closing brackets
		function handleBracketPairWhiteSpace(i: number): number {
			if (textArray[i-1] === '(') {
				i = skipWhiteSpace(i);
				return i;
			}
			i = skipWhiteSpace(i);
			if (textArray[i+1] === ')') {
				return i;
			}
			if (stateString === "prefun") {
				formattedText += '\t';
			}
			else {
				formattedText += ' ';
			}
			return i;
		}

		// function to handle whitespace and/or comment after bracket pair closed
		function handlePostBracketPairWhiteSpace(i: number): number {
			i = skipWhiteSpace(i);
			// comment after closing bracket
			if (textArray[i+1] === ';') {
				formattedText += " ";
			}
			else {
				formattedText += '\n' + '\n' + '\t';
			}
			return i;
		}
	}
}