/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as tmp from 'tmp';
import fs = require('fs');
import { URL } from "url";


export class Util {
    
    static q(path: string): string {
        return path.includes(' ') ? `"${path}"` : path;
    }

    static toFile(prefix: string, suffix: string, text: string): string {
        var tempFile = tmp.fileSync({ mode: 0o644, prefix: prefix + '-', postfix: suffix });
        fs.writeSync(tempFile.fd, text, 0, 'utf8');
        return tempFile.name;
    }

    static toPddlFile(prefix: string, text: string): string {
        return Util.toFile(prefix, '.pddl', text);
    }

    static fsPath(fileUri: string): string {

        let url = new URL(fileUri);
        let decodedPath: string = decodeURIComponent(url.pathname);
        if(decodedPath.startsWith('/')) decodedPath = decodedPath.substr(1);

        return decodedPath;
    }

    /**
     * Replaces all occurrences
     * @param text text to replace in
     * @param searchValue value to replace
     * @param replaceValue replacement value
     */
    static replaceAll(text: string, searchValue: string, replaceValue: string): any {
        return text.split(searchValue).join(replaceValue);
    }
} 