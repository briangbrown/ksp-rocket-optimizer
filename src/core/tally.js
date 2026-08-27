/* A count of how much searching a solve actually did. Reset per run and read
   afterwards — a rough sense of the space is useful when a design looks odd,
   and it makes the cost of a wider search visible rather than only felt.

   Its own module, small as it is, because it was in solver.js and ascent.js
   imports it. That one import was enough to pull the entire solver into any
   bundle that wanted the ascent simulation, which is the whole main bundle. */
const TALLY = { stages: 0, boosted: 0, flights: 0, chains: 0 };
const resetTally = () => {
  TALLY.stages = 0;
  TALLY.boosted = 0;
  TALLY.flights = 0;
  TALLY.chains = 0;
};

export { TALLY, resetTally };
