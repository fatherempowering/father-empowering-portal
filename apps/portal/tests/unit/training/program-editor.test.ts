import { describe, expect, it } from "vitest";
import { programEditorSchema, saveProgramRequestSchema } from "@/lib/contracts/training-drafts";
import { addLibraryExercise, compactUniformSets, draftWarnings, duplicateWeek, moveItem, newBlock, newProgram, newSession } from "@/lib/training/program-editor";
import { pilotProgramExerciseSchema } from "@/lib/contracts/training-pilot";
import { buildPilotCatalog } from "@/lib/training/pilot/model";
import source from "@/lib/training/pilot/source.json";
import { exerciseSnapshotSchema } from "@/lib/contracts/training";
const id = "19000000-0000-4000-8000-000000000001";
const library = { id, name:"Press", equipment:"Dumbbells", cue:{fr:"Contrôle",en:"Control"}, defaultUnit:"lb" as const, archived:false, version:1,createdBy:id,updatedAt:"2026-10-14T00:00:00Z",canEdit:true };
function complete() { const p=newProgram(); const s=newSession(); const b=newBlock(); b.exercises.push(addLibraryExercise(library)); s.blocks.push(b); p.weeks[0].sessions.push(s); return p; }
function pilotLibrary(sourceId: string) {
  const candidate = buildPilotCatalog(source).items.find((item) => item.id === sourceId)!;
  const pilot = pilotProgramExerciseSchema.parse({
    sourceId: candidate.id, sourceVersion: candidate.sourceVersion, sourceCatalogVersion: "3.1.0-pilot.1", integrationVersion: "fe-program-pilot.1", usage: "STAGING_TEST",
    name: candidate.name, equipment: candidate.equipment, instructions: candidate.instructions,
    performance: { ...candidate.performance, loadEntryBasis: source.exercises.find((item) => item.id === sourceId)!.performance.load_entry_basis },
  });
  return { ...library, name: candidate.name.en, canEdit: false, pilot };
}
describe("Program editor contract", () => {
  it("accepts existing ordinary library records and authorized pilot snapshots", () => {
    expect(exerciseSnapshotSchema.parse(library)).toEqual(library);
    const pilot = pilotLibrary("DB_034");
    expect(exerciseSnapshotSchema.parse(pilot)).toEqual(pilot);
  });
  it("saves incomplete weeks and groups without pretending they are published", () => {
    const p=newProgram(); expect(programEditorSchema.safeParse(p).success).toBe(true); expect(draftWarnings(p)).toHaveLength(1);
    const s=newSession(); p.weeks[0].sessions.push(s); s.blocks.push({...newBlock(),mode:"superset"});
    expect(programEditorSchema.safeParse(p).success).toBe(true); expect(draftWarnings(p).length).toBeGreaterThan(1);
    expect(programEditorSchema.safeParse({...p,clientId:id}).success).toBe(false);
  });
  it("deep clones exercise snapshots and uses unique instance IDs", () => {
    const first=addLibraryExercise(library); const second=addLibraryExercise(library);
    expect(first.id).not.toBe(second.id); first.cue.fr="Changed"; expect(library.cue.fr).toBe("Contrôle");
  });
  it("preserves all fifteen full pilot snapshots without truncating or mutating the source", () => {
    for (const item of source.exercises) {
      const selected = pilotLibrary(item.id);
      const before = structuredClone(selected);
      const exercise = addLibraryExercise(selected);
      expect(exercise.pilot).toEqual(selected.pilot);
      expect(exercise.pilot?.instructions).toEqual(selected.pilot.instructions);
      expect(exercise.pilot?.usage).toBe("STAGING_TEST");
      expect(exercise.media).toBeNull();
      expect(exercise.pilot).not.toHaveProperty("machines");
      exercise.pilot!.instructions.fr.setup = "Edited copy";
      exercise.pilot!.performance.counting.fr = "Edited count";
      expect(selected).toEqual(before);
    }
  });
  it("retains per-arm counting and preserves independent copied week guidance", () => {
    const p = complete();
    p.weeks[0].sessions[0].blocks[0].exercises = [addLibraryExercise(pilotLibrary("DB_034"))];
    const duplicated = duplicateWeek(p, 0);
    const first = duplicated.weeks[0].sessions[0].blocks[0].exercises[0];
    const last = duplicated.weeks[1].sessions[0].blocks[0].exercises[0];
    expect(last.pilot?.performance.countingDecision).toBe("MAX_PER_ARM_2026_10_23");
    expect(last.pilot?.performance.counting.fr).toBe("Répétitions par bras");
    expect(last.prescription.reps).toBe("8-10");
    expect(last.id).toBe(first.id);
    last.pilot!.instructions.fr.setup = "Separate copy";
    last.prescription.loadTarget = "25 lb par haltère";
    expect(first.pilot?.instructions.fr.setup).not.toBe("Separate copy");
    expect(first.prescription.loadTarget).toBe("");
  });
  it.each([
    ["BW_049", "sec", "la durée cible en secondes"],
    ["DB_045", "distance", "la distance cible en mètres"],
    ["BA_027", "configuration", "la configuration cible"],
  ])("requires an explicit Coach goal for %s without inventing units or targets", (sourceId, unit, warning) => {
    const exercise = addLibraryExercise(pilotLibrary(sourceId));
    expect(exercise.prescription.unit).toBe(unit);
    expect(exercise.prescription.loadTarget).toBe("");
    expect(exercise.prescription.reps).toBe(unit === "configuration" ? "8-10" : "1");
    const p = complete(); p.weeks[0].sessions[0].blocks[0].exercises = [exercise];
    expect(programEditorSchema.safeParse(p).success).toBe(true);
    expect(draftWarnings(p).some((message) => message.includes(warning))).toBe(true);
    exercise.prescription.loadTarget = unit === "configuration" ? "Bande identifiée, ancrage hauteur poitrine" : "20";
    expect(draftWarnings(p).some((message) => message.includes(warning))).toBe(false);
    const { sets, ...common } = exercise.prescription;
    exercise.prescription.prescribedSets = Array.from({ length: sets }, (_, index) => ({ ...common, loadTarget: index === 1 ? "" : common.loadTarget }));
    expect(draftWarnings(p).some((message) => message.includes(warning))).toBe(true);
  });
  it("duplicates a week with stable movement identities and independent prescriptions", () => {
    const p=complete(); const duplicated=duplicateWeek(p,0);
    duplicated.weeks[1].sessions[0].blocks[0].exercises[0].prescription.loadTarget="50 lb";
    expect(p.weeks).toHaveLength(1); expect(duplicated.weeks[0].sessions[0].blocks[0].exercises[0].prescription.loadTarget).toBe("");
    expect(duplicated.weeks[0].sessions[0].id).toBe(duplicated.weeks[1].sessions[0].id);
    expect(programEditorSchema.safeParse(duplicated).success).toBe(true);
  });
  it("rejects duplicate IDs within a week and nonconsecutive weeks", () => {
    const p=complete(); p.weeks[0].sessions.push(structuredClone(p.weeks[0].sessions[0]));
    expect(programEditorSchema.safeParse(p).success).toBe(false);
    const fresh=newProgram(); fresh.weeks[0].number=2; expect(programEditorSchema.safeParse(fresh).success).toBe(false);
  });
  it("never silently treats a training block as complete rest", () => {
    const p=complete(); p.weeks[0].sessions[0].type="complete-rest"; expect(programEditorSchema.safeParse(p).success).toBe(false);
    p.weeks[0].sessions[0].blocks=[]; expect(programEditorSchema.safeParse(p).success).toBe(true);
  });
  it("keeps schedules explicit", () => {
    const p=complete(); p.weeks[0].sessions[0].schedule={mode:"fixed",day:null}; expect(programEditorSchema.safeParse(p).success).toBe(false);
  });
  it("compacts identical series while preserving differing series", () => {
    const p=complete(); const prescription=p.weeks[0].sessions[0].blocks[0].exercises[0].prescription;
    const {sets,...base}=prescription; prescription.prescribedSets=Array.from({length:sets},()=>({...base,reps:"12"}));
    const compact=compactUniformSets(p).weeks[0].sessions[0].blocks[0].exercises[0].prescription;
    expect(compact.prescribedSets).toBeUndefined(); expect(compact.reps).toBe("12");
    prescription.prescribedSets[1].reps="10"; expect(compactUniformSets(p).weeks[0].sessions[0].blocks[0].exercises[0].prescription.prescribedSets).toHaveLength(3);
  });
  it("bounds scalars and denies arbitrary media or forged identity", () => {
    const p=complete(); const e=p.weeks[0].sessions[0].blocks[0].exercises[0];
    e.prescription.sets=21; expect(programEditorSchema.safeParse(p).success).toBe(false); e.prescription.sets=3;
    expect(programEditorSchema.safeParse({...p,title:{fr:"",en:""}}).success).toBe(false);
    expect(programEditorSchema.safeParse({...p,weeks:Array.from({length:53},(_,i)=>({...p.weeks[0],number:i+1}))}).success).toBe(false);
    const command={id:null,expectedVersion:0,clientMutationId:id,document:p};
    expect(saveProgramRequestSchema.safeParse(command).success).toBe(true);
    for(const patch of [{ownerId:id},{expectedVersion:1},{id}]) expect(saveProgramRequestSchema.safeParse({...command,...patch}).success).toBe(false);
    expect(programEditorSchema.safeParse({...p,weeks:[{...p.weeks[0],sessions:[{...p.weeks[0].sessions[0],blocks:[{...p.weeks[0].sessions[0].blocks[0],exercises:[{...e,media:{assetId:id,kind:"VIDEO"}}]}]}]}]}).success).toBe(false);
  });
  it("reorders without mutating the original array", () => { const a=[1,2,3]; expect(moveItem(a,1,-1)).toEqual([2,1,3]); expect(a).toEqual([1,2,3]); expect(moveItem(a,0,-1)).toEqual(a); });
});
