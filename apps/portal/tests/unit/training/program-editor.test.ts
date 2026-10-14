import { describe, expect, it } from "vitest";
import { programEditorSchema, saveProgramRequestSchema } from "@/lib/contracts/training-drafts";
import { addLibraryExercise, compactUniformSets, draftWarnings, duplicateWeek, moveItem, newBlock, newProgram, newSession } from "@/lib/training/program-editor";
const id = "19000000-0000-4000-8000-000000000001";
const library = { id, name:"Press", equipment:"Dumbbells", cue:{fr:"Contrôle",en:"Control"}, defaultUnit:"lb" as const, archived:false, version:1,createdBy:id,updatedAt:"2026-10-14T00:00:00Z",canEdit:true };
function complete() { const p=newProgram(); const s=newSession(); const b=newBlock(); b.exercises.push(addLibraryExercise(library)); s.blocks.push(b); p.weeks[0].sessions.push(s); return p; }
describe("Program editor contract", () => {
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
