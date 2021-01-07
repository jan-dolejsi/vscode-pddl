
/**
 * Swim lane visualization for activities that may run in sequence or in parallel. 
 * This utility helps placing activities into the lane, so they do not overlap. 
 */
export class SwimLane {

    /** Lanes and the width at which the last step in each of them ends. */
    private subLaneEnds: number[] = [];

    /**
     * Constructs the swim lane
     * @param separation separation enforced between bars in the sane lane (default is 0)
     */
    constructor(public separation = 0) {}

    /**
     * Finds the first available lane that is not already occupied at offset leftOffset 
     * @param leftOffset offset from the left for the new step to be placed 
     * @param width step width
     */
    placeNext(leftOffset: number, width: number): number {
        let availableLane = -1;
        for (let index = 0; index < this.subLaneEnds.length; index++) {
            
            if (this.subLaneEnds[index] + this.separation < leftOffset) {
                availableLane = index;
                break;
            }
        }
        
        if(availableLane < 0) {
            // no lane was available, must create a new one
            this.subLaneEnds.push(0);
            availableLane = this.subLaneEnds.length -1;
        }

        // adjust the lane end to the end of the newly placed activity
        this.subLaneEnds[availableLane] = leftOffset + width;

        return availableLane;
    }

    laneCount(): number {
        return this.subLaneEnds.length;
    }

    laneEnd(idx: number): number {
        if (idx >= this.subLaneEnds.length) {
            throw new Error('Lane does not exist');
        }
        return this.subLaneEnds[idx];
    }
}