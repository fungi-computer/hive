# Connected atmosphere owner

`createAtmosphere` owns finite carrier gas, smoke tracer and sensible heat in a
bounded graph of physical volumes and openings. Goblin supplies those volumes
from current world geometry, plus ambient conditions, opening permeability and
finite paid source rates. The engine has no fuel, recipe, actor, clock, save IO,
renderer or scheduler.

Each volume lists its stable physical cell membership and current free gas
volume. Openings are the only exchange paths; an intact surface has no entry and
cannot mix. Keeping horizontally connected cells in height bands gives rooms,
upper floors, caves and shafts separate cheap stocks while preserving explicit
vertical and exterior paths. The Goblin producer also cuts broad floors into
bounded eight-metre local bands, so one castle or cave does not become one
instant well-mixed parcel.

Raw snapshot admission covers at most 40,000 free cells and 120,000 declared
faces. Compilation has separate limits of 2,048 local parcels and 56,000
cross-parcel openings; internal faces disappear into bounded band membership.
The 32 MiB wire and two-million-node ceilings cover the named 17x17x128
Clearing envelope. These are admission bounds, not measured tick capacity.

`advance` applies at most six seconds of source and opening exchange to a
detached candidate. It conserves carrier, smoke and heat through paired stock,
source and signed boundary ledgers. The model is a game-scale well-mixed volume
approximation. It does not resolve velocity, flames, chemistry, oxygen,
radiation, acoustics or CFD pressure.

Definitions, initial parcels, saves and advance options cross the shared bounded
plain-data codec before their strict schemas. Vacuum and finite underpressure are
valid transient states, allowing newly opened void to fill gradually. The upper
pressure envelope and strictly positive absolute-temperature envelope remain
atomic admission limits. Definition admission also budgets the complete
canonical save envelope, including escaped identity and repeated parcel IDs.

`rebind` is the serial physical-edit preflight. Stock follows stable member-cell
overlap. Shrink retains and compresses that stock. Removing the final positive
volume forces its parcel through the old physical opening graph to a surviving
volume or ambient; a pocket with no route blocks. Newly carved or drained void
starts empty and fills only through ordinary elapsed-time exchange over declared
faces. Rebind never treats graph reachability as instantaneous mixing or ambient
refill. Pressure, temperature, smoke fraction and arithmetic limits can block
the whole detached change. The caller commits water/solid geometry and
atmosphere together only after this result is applied.

State intentionally has no elapsed time. A Region or game tick supplies the same
admitted interval used by its other active fields. Finite releases remain queries
against that host clock and paid material receipt; their cursor is not copied
here.
