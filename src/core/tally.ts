/* A count of how much searching a solve actually did. Reset per run and read
   afterwards — a rough sense of the space is useful when a design looks odd,
   and it makes the cost of a wider search visible rather than only felt.

   Its own module, small as it is, because it was in solver.js and ascent.js
   imports it. That one import was enough to pull the entire solver into any
   bundle that wanted the ascent simulation, which is the whole main bundle. */
type Tally = {
  stages: number;
  boosted: number;
  flights: number;
  chains: number;
};

const TALLY: Tally = { stages: 0, boosted: 0, flights: 0, chains: 0 };
const resetTally = () => {
  TALLY.stages = 0;
  TALLY.boosted = 0;
  TALLY.flights = 0;
  TALLY.chains = 0;
};

/* Fold another thread's counters in. Here rather than in the worker that calls
   it, so the list of counters exists in one place and a new one cannot be added
   without the sharded search learning to carry it. */
const addTally = (t: Tally) => {
  TALLY.stages += t.stages;
  TALLY.boosted += t.boosted;
  TALLY.flights += t.flights;
  TALLY.chains += t.chains;
};

export { TALLY, addTally, resetTally };
export type { Tally };
