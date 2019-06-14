/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export class StudentNameParser {

    parse(input: string): StudentName[] {
        return input.split(';')
            .map(name => name.trim())
            .filter(name => name.length) // skip empty names e.g. after a trailing semicolon
            .map(name => this.parseName(name));
    }

    validateClassroomNames(input: string): string {
        let invalidNames = input.split(';')
            .map(name => name.trim())
            .filter(name => name.length) // skip empty names e.g. after a trailing semicolon
            .filter(name => !this.parseName(name));

        if (invalidNames.length) {
            return 'Invalid names: ' + invalidNames.join(', ');
        }
        else {
            return null; // this is the expected value for 'input is valid'
        }
    }

    EMAIL_PATTERN = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    NAME_PATTERN = /^[\w \-\.]+$/;
    NAME_AND_EMAIL_PATTERN = /(^[\w \-\.]+)\s*(<(.+)>)?$/;

    parseName(name: string): StudentName | null {
        this.EMAIL_PATTERN.lastIndex = 0;
        this.NAME_PATTERN.lastIndex = 0;
        this.NAME_AND_EMAIL_PATTERN.lastIndex = 0;

        var match: RegExpMatchArray;

        if (match = name.match(this.EMAIL_PATTERN)) {
            return new StudentName(match[0], match[0]); // it is valid
        }
        else if (match = name.match(this.NAME_PATTERN)) {
            return new StudentName(match[0], null); // it is valid
        }
        else if (match = name.match(this.NAME_AND_EMAIL_PATTERN)) {
            let emailPart = match[3].trim();
            this.EMAIL_PATTERN.lastIndex = 0;
            if (emailPart.match(this.EMAIL_PATTERN) === null) { return null; }

            return new StudentName(match[1].trim(), match[3].trim());
        }

        return null; // it is invalid
    }
}

export class StudentName {
    constructor(public readonly name: string, public readonly email: string) { }

    getEffectiveName(): string {
        return this.name;
    }

    getEffectivePath(): string {
        return this.name.replace(' ', '_').replace('@', '_at_');
    }
}