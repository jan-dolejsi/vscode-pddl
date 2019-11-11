/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { FileInfo, PddlLanguage, ParsingProblem } from "./FileInfo";
import { DocumentPositionResolver } from "./DocumentPositionResolver";

/**
 * Plan happenings file.
 */
export class HappeningsInfo extends FileInfo {

    private happenings: Happening[] = [];

    constructor(fileUri: string, version: number, public problemName: string, public domainName: string, text: string, positionResolver: DocumentPositionResolver) {
        super(fileUri, version, problemName, positionResolver);
        this.setText(text);
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.HAPPENINGS;
    }

    setHappenings(happenings: Happening[]): void {
        this.happenings = happenings;
    }

    getHappenings(): Happening[] {
        return this.happenings;
    }

    isHappenings(): boolean {
        return true;
    }
}

/**
 * Single plan happening e.g. a thing that happens at a given time.
 */
export class Happening {
    private actionName: string;
    objects: string[];

    /**
     * Constructs happening instance.
     * @param time happening time
     * @param type happening type
     * @param fullActionName action name including parameter names
     * @param counter same happening counter
     * @param lineIndex line index in the file
     */
    constructor(private time: number, private type: HappeningType,
        private fullActionName: string, public readonly counter: number,
        public readonly lineIndex?: number) {

        let nameFragments = fullActionName.split(' ');
        this.actionName = nameFragments[0];
        this.objects = nameFragments.slice(1);
    }

    /**
     * Happening time.
     */
    getTime(): number {
        return this.time;
    }

    /**
     * Happening type: start/end/instantaneous/til/tif
     */
    getType(): HappeningType {
        return this.type;
    }

    /**
     * Action name without parameters.
     */
    getAction(): string {
        return this.actionName;
    }

    /**
     * Action name with parameters.
     */
    getFullActionName(): string {
        return this.fullActionName;
    }

    /**
     * Counter for the equivalent actions within the same plan.
     */
    getCounter(): number {
        return this.counter;
    }

    /**
     * Returns true if this happening belongs to the other happening.
     * It is decided by comparing the full action name and the counter.
     */
    belongsTo(other: Happening): boolean {
        if (other === null || other === undefined) {
            return false;
        }

        return this.fullActionName === other.fullActionName
            && this.counter === other.counter;
    }

    toString(): string {
        return `${this.time}: ${this.toHappeningType(this.type)} (${this.fullActionName}) #${this.counter}`;
    }

    toHappeningType(type: HappeningType): string {
        switch (type) {
            case HappeningType.START:
                return 'start ';
            case HappeningType.END:
                return 'end ';
            default:
                return '';
        }
    }
}

export enum HappeningType { START, END, INSTANTANEOUS, TIMED }

/**
 * Builds the list of happenings while validating the sequence.
 */
export class PlanHappeningsBuilder {

    // all happenings parsed thus far
    private happenings: Happening[] = [];
    // parsing problems to report
    private parsingProblems: ParsingProblem[] = [];

    // plan makespan thus far
    makespan = 0;

    // open actions (action starts that were not matched with an end yet)
    private openActions: Happening[] = [];

    constructor(private epsilon: number) { }

    happeningPattern = /^\s*((\d+|\d+\.\d+|\.\d+)\s*:)?\s*(start|end)?\s*\(([\w -]+)\)\s*(#\d+)?\s*(;.*)?\s*$/;
    whiteSpacePattern = /^\s*(;.*)?\s*$/;

    tryParseFile(fileText: string): void {
        fileText.split('\n')
            .forEach((planLine: string, index: number) => {
                if (!this.isWhiteSpace(planLine)) {
                    this.tryParse(planLine, index);
                }
            });
    }

    isWhiteSpace(planLine: string): boolean {
        this.whiteSpacePattern.lastIndex = 0;
        return this.whiteSpacePattern.exec(planLine) !== null;
    }

    tryParse(planLine: string, lineIndex: number | undefined): void {
        let happening = this.parse(planLine, lineIndex);
        if (happening) {
            this.add(happening);
        } else {
            this.parsingProblems.push(new ParsingProblem(`Invalid happening syntax: ${planLine}`, lineIndex));
        }
    }

    /**
     * Parses single line of plan text.
     * @param planLine line of plan text
     * @param lineIndex line number
     */
    parse(planLine: string, lineIndex: number | undefined): Happening | undefined {
        this.happeningPattern.lastIndex = 0;
        let group = this.happeningPattern.exec(planLine);
        if (group) {
            // this line is a valid plan happening
            let time = group[2] ? parseFloat(group[2]) : this.getMakespan() + this.epsilon;
            let type = this.parseType(group[3]);
            let action = group[4];
            let counter = group[5] ? parseInt(group[5].substring(1)) : 0;

            return new Happening(time, type, action, counter, lineIndex);
        } else {
            return undefined;
        }
    }

    add(happening: Happening) {
        switch (happening.getType()) {
            case HappeningType.START:
                let alreadyExistingStart = this.openActions.concat(this.happenings).find(happening1 =>
                    happening1.getType() === HappeningType.START
                    && happening1.belongsTo(happening)
                );
                if (alreadyExistingStart) {
                    this.parsingProblems.push(new ParsingProblem(`A happening matching ${happening.toString()} is already in the plan. Increase the #N counter.`, happening.lineIndex));
                }
                this.openActions.push(happening);
                break;
            case HappeningType.END:
                // there must be an open start
                let matchingStart = this.openActions.find(start => start.belongsTo(happening));
                if (matchingStart) {
                    this.openActions.splice(this.openActions.indexOf(matchingStart), 1);
                }
                else {
                    this.parsingProblems.push(new ParsingProblem(`There is no start corresponding to ${happening.toString()}`, happening.lineIndex));
                }
                break;
        }

        // adjust the plan makespan
        if (this.makespan < happening.getTime()) {
            this.makespan = happening.getTime();
        }
        else if (this.makespan > happening.getTime()) {
            this.parsingProblems.push(new ParsingProblem(`Time must not go backwards.`, happening.lineIndex));
        }
        this.happenings.push(happening);
    }

    validateOpenQueueIsEmpty(): void {
        let problems = this.openActions
            .map(start => new ParsingProblem(`Missing end of ${start.toString()}`, start.lineIndex));

        this.parsingProblems.push(...problems);
    }

    getHappenings(): Happening[] {
        return this.happenings;
    }

    getMakespan(): number {
        return this.makespan;
    }

    getParsingProblems(): ParsingProblem[] {
        return this.parsingProblems;
    }

    private parseType(typeAsString: string): HappeningType {
        switch (typeAsString) {
            case "start":
                return HappeningType.START;
            case "end":
                return HappeningType.END;
            case undefined:
                return HappeningType.INSTANTANEOUS;
            default:
                throw new Error(`Unexpected happening type: ${typeAsString}`);
        }
    }
}