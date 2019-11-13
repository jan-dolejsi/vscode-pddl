/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { FileInfo, PddlLanguage } from "./FileInfo";
import { PreProcessor } from "./PreProcessors";
import { PddlSyntaxTree } from "./PddlSyntaxTree";
import { DocumentPositionResolver } from "./DocumentPositionResolver";
import { TypeObjects } from "./DomainInfo";
import { Constraint } from "./constraints";

/**
 * Problem file.
 */
export class ProblemInfo extends FileInfo {
    objects: TypeObjects[] = [];
    inits: TimedVariableValue[] = [];
    supplyDemands: SupplyDemand[] = [];
    private constraints: Constraint[] = [];
    preParsingPreProcessor: PreProcessor;

    constructor(fileUri: string, version: number, problemName: string, public domainName: string, public readonly syntaxTree: PddlSyntaxTree, positionResolver: DocumentPositionResolver) {
        super(fileUri, version, problemName, positionResolver);
    }

    setPreParsingPreProcessor(preProcessor: PreProcessor) {
        this.preParsingPreProcessor = preProcessor;
    }
    
    getPreParsingPreProcessor(): PreProcessor {
        return this.preParsingPreProcessor;
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
    }

    setObjects(objects: TypeObjects[]): void {
        this.objects = objects;
    }

    getObjects(type: string): string[] {
        let thisTypesObjects = this.objects.find(to => to.type === type);

        if (!thisTypesObjects) { return []; }
        else { return thisTypesObjects.getObjects(); }
    }

    getObjectsPerType(): TypeObjects[] {
        return this.objects;
    }

    /**
     * Sets predicate/function initial values.
     * @param inits initial values
     */
    setInits(inits: TimedVariableValue[]): void {
        this.inits = inits;
    }

    /**
     * Returns variable initial values and time-initial literals/fluents. 
     */
    getInits(): TimedVariableValue[] {
        return this.inits;
    }

    setSupplyDemands(supplyDemands: SupplyDemand[]): void {
        this.supplyDemands = supplyDemands;
    }

    getSupplyDemands(): SupplyDemand[] {
        return this.supplyDemands;
    }

    setConstraints(constraints: Constraint[]): void {
        this.constraints = constraints;
    }

    getConstraints(): Constraint[] {
        return this.constraints;
    }

    isProblem(): boolean {
        return true;
    }
}

/**
 * Variable value effective from certain time, e.g. initialization of the variable in the problem file.
 */
export class TimedVariableValue {
    constructor(private time: number, private variableName: string, private value: number | boolean, private _isSupported: boolean = true) {

    }

    static from(time: number, value: VariableValue): TimedVariableValue {
        return new TimedVariableValue(time, value.getVariableName(), value.getValue(), value.isSupported);
    }

    /**
     * Makes a deep copy of the supplied value and returns a new instance
     * @param value value to copy from
     */
    static copy(value: TimedVariableValue): TimedVariableValue {
        return new TimedVariableValue(value.time, value.variableName, value.value, value.isSupported);
    }

    get isSupported(): boolean {
        return this._isSupported;
    }

    getTime(): number {
        return this.time;
    }

    getVariableName(): string {
        return this.variableName;
    }

    getLiftedVariableName(): string {
        return this.variableName.split(' ')[0];
    }

    getValue(): number | boolean {
        return this.value;
    }

    /**
     * Updates this value.
     * @param newValue new value
     */
    update(time: number, newValue: VariableValue): void {
        this.time = time;
        this.value = newValue.getValue();
    }

    /**
     * Determines whether the variable name and value are the same, ignoring the timestamp.
     * @param other other timed variable value
     */
    sameValue(other: TimedVariableValue): boolean {
        return this.getVariableName() === other.getVariableName()
            && this.getValue() === other.getValue();
    }

    getVariableValue(): VariableValue {
        return new VariableValue(this.variableName, this.value);
    }

    toString(): string {
        return `${this.variableName}=${this.value} @ ${this.time}`;
    }
}

/**
 * Variable value initialiation in the problem file.
 */
export class VariableValue {
    constructor(private variableName: string, private value: number | boolean) {

    }

    getVariableName(): string {
        return this.variableName;
    }

    getValue(): number | boolean {
        return this.value;
    }

    negate(): VariableValue {
        return new VariableValue(this.variableName, !this.value);
    }

    get isSupported(): boolean { 
        return true;
    }
}

export class UnsupportedVariableValue extends VariableValue {
    constructor(text: string) {
        super(text, false);
    }

    negate(): VariableValue {
        return this;
    }

    get isSupported(): boolean {
        return false;
    }
}

/**
 * Supply-demand contract.
 */
export class SupplyDemand {
    constructor(private name: string) { }
    
    getName(): string {
        return this.name;
    }
}