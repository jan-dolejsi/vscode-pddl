        // old algorithm

		let selection = document.getText();
		let textArray = selection.split('');
		let formattedText = "";
		let open = false;
		let openInheritance = false;
		let predicates = false;
		let alphaRegExp = new RegExp('[a-zA-Z]');
		let whiteRegExp = new RegExp('[\r\n\t]');
		let numRegExp = new RegExp('[0-9]');
		let firstBracket = false;

		for (let index = 0; index < textArray.length; index++) {
			
			// STUFF TO DO:
			// refactor
			// comments everywhere support
			// actions support
			// support for removing multiple spaces
			// indentation config options built into vscode
				if (index == 0) {
				    firstBracket = true;
				    while (whiteRegExp.test(textArray[index]) || textArray[index] == ' ') {
					    index++;
				    }
				    if (textArray[index] == ';') {
					    while (!whiteRegExp.test(textArray[index])) {
						    formattedText += textArray[index];
						    index++;
					    }
					    formattedText += '\n' + '\n';
				    }
			    }

				const element = textArray[index];
				
				if ((element == '(' && firstBracket == true) || element == ')' && index == textArray.length - 1) {
					formattedText += element;
					firstBracket = false;
					continue;
				}
				if (predicates == true && element == '(') {
					while (whiteRegExp.test(textArray[index + 1]) || textArray[index + 1] == ' ') {
						index++;
					}
					formattedText += '\t' + element;
					continue;
				}
				if (predicates == true && element == '-') {
					formattedText += element + ' ';
					while (whiteRegExp.test(textArray[index + 1]) || textArray[index + 1] == ' ') {
						index++;
					}
					continue;
				}
				if (predicates == true && element == ')') {
					while (whiteRegExp.test(textArray[index + 1]) || textArray[index + 1] == ' ') {
						index++;
					}
					formattedText += ')';
					if (textArray[index + 1] == ')') {
						predicates = false;
					}
					else {
						formattedText += '\n' + '\t' + '\t' + '\t' + '\t';
					}
					continue;
				}
				if (alphaRegExp.test(element)) {
					formattedText += element;
					continue;
				}
				if (numRegExp.test(element)) {
					formattedText += element;
					continue;
				}
				if ((whiteRegExp.test(element) || element == ' ' || element == ')') && openInheritance == true)  {
					openInheritance = false;
					if (element == ')') {
						index--;
						continue;
					}
					while (whiteRegExp.test(textArray[index + 1]) || textArray[index + 1] == ' ') {
						index++;
					}
					formattedText += '\n' + '\t' + '\t' + '\t';
					continue;
				}
				if (element == ' ') {
					formattedText += ' ';
					continue;
				}
				if (element == ':') {
					formattedText += element;
					if (textArray[index + 1] == 'p' || textArray[index + 1] == 'f') {
						predicates = true;
					}
					continue;
				}
				if (element == '?') {
					formattedText += element;
					continue;
				}
				if (element == '-') {
					formattedText += element + ' ';
					openInheritance = true;
					while (whiteRegExp.test(textArray[index + 1]) || textArray[index + 1] == ' ') {
						index++;
					}
					continue;
				}
				if (element == '(') {
					formattedText += element;
					open = true;
					continue;
				}
				if (element == ')' && open == true) {
					formattedText += element;
					open = false;
					while (whiteRegExp.test(textArray[index + 1]) || textArray[index + 1] == ' ') {
						index++;
					}
					if (index + 1 != textArray.length - 1) {
						formattedText += '\n' + '\n' + '\t';
					}
					else {
						formattedText += '\n';
					}
				}
			}

            let invalidRange = new Range(0, 0, document.lineCount /*intentionally missing the '-1' */, 0);
            let fullRange = document.validateRange(invalidRange);
        
        return [TextEdit.replace(fullRange, formattedText)];