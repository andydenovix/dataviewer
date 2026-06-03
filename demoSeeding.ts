import { 
  getFirestore, 
  collection, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { createProject } from './projectService';

/**
 * Seeds the database with demo projects and samples for testing.
 * @param userId The ID of the user to own the data.
 */
export async function seedDemoData(userId: string) {
  const db = getFirestore();

  console.log("Starting demo data seeding...");

  // 1. Create Demo Projects
  const projects = [
    { name: "Oncology Trial 2024", desc: "Tumor sequencing batch" },
    { name: "Protein Purification", desc: "BSA Standards and experimental runs" },
    { name: "Environmental DNA Survey", desc: "Monitoring local water sources" }
  ];

  const projectIds: string[] = [];
  for (const p of projects) {
    const id = await createProject(p.name, userId);
    projectIds.push(id);
  }

  // 2. Define Demo Samples with varying metadata
  const samples = [
    // Linked to Oncology Project
    { name: "Patient_001_Tumor", projectId: projectIds[0], type: "dsDNA", conc: 45.2 },
    { name: "Patient_001_Normal", projectId: projectIds[0], type: "dsDNA", conc: 12.5 },
    { name: "Patient_002_Tumor", projectId: projectIds[0], type: "dsDNA", conc: 52.8 },

    // Linked to Protein Project
    { name: "BSA_Standard_1000", projectId: projectIds[1], type: "Protein A280", conc: 1000.0 },
    { name: "BSA_Standard_500", projectId: projectIds[1], type: "Protein A280", conc: 500.0 },
    { name: "Purified_IgG_Fraction_1", projectId: projectIds[1], type: "Protein A280", conc: 320.4 },

    // Linked to Environmental Project
    { name: "River_Inlet_Site_A", projectId: projectIds[2], type: "Custom", conc: 3.1 },
    { name: "Pond_Outlet_Site_B", projectId: projectIds[2], type: "Custom", conc: 8.4 },

    // Unassigned (to test "No Project" state)
    { name: "Quick_RNA_Check", projectId: null, type: "RNA", conc: 22.0 }
  ];

  // 3. Add Samples to Firestore
  for (const s of samples) {
    await addDoc(collection(db, "samples"), {
      name: s.name,
      projectId: s.projectId,
      userId: userId,
      sampleType: s.type,
      concentration: s.conc,
      unit: "ng/µL",
      createdAt: serverTimestamp(),
      // Basic mock spectroscopy data
      a260: s.type === "dsDNA" ? s.conc / 50 : 0.5,
      a280: s.type === "dsDNA" ? (s.conc / 50) * 0.55 : 0.8
    });
  }

  console.log(`Seeding complete. Created ${projectIds.length} projects and ${samples.length} samples.`);
}