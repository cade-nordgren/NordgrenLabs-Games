// Owner content for the full-fidelity game: one authoring file per slot type in this folder (the content kit,
// docs/content-kit/README.md). The files ship as empty templates; the content report lists every missing slot
// and the full Start stays blocked until every slot is approved and valid.
import { loadSlots, ownerContent } from '../schema.js';

export default ownerContent(await loadSlots(import.meta.url));
