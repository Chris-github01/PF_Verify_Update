export const plumbingHandoverChecklist = {
  preStart: {
    title: "Pre-Start Checklist",
    items: [
      "Site induction completed (plumbing/hydraulics hazards)",
      "Plumbing SWMS reviewed and approved",
      "Supervisor/licence/competency verified (NZ: licensed certifier where applicable; AU: licensed plumber requirements)",
      "Latest drawings/specs and coordination drawings available",
      "Penetration / setout coordination confirmed (builder + passive fire interface)",
      "Builders works responsibilities confirmed (core holes, trenches, plinths, roof penetrations)",
      "Material approvals confirmed (pipe types, valves, fixtures, backflow devices)",
      "Long-lead items confirmed (fixtures, pumps, TMVs, backflow devices, tanks)",
      "Water shutdowns / tie-in windows confirmed (if live building)",
      "Interface responsibilities confirmed (civil drainage, fire services, mechanical plant, electrical for pumps/heaters)"
    ]
  },
  installation: {
    title: "Installation Checklist",
    items: [
      "Pipework installed to drawings/specs with correct materials and supports",
      "Pipe gradients/falls confirmed for drainage (where applicable)",
      "Isolation valves installed and accessible",
      "Backflow prevention devices installed to approved locations and standards",
      "Hot water systems installed and temperature control devices fitted (TMVs where required)",
      "Fixtures and fit-off installed as specified",
      "Pump sets, PRVs, strainers installed where applicable",
      "Acoustic and seismic restraints installed where required",
      "Insulation installed where specified (thermal/condensation)",
      "Roof penetrations and flashings coordinated and completed (if in scope)",
      "No unapproved deviations from approved scope"
    ]
  },
  qualityControlTesting: {
    title: "Quality Control & Testing",
    items: [
      "Visual inspection completed for all pipework",
      "Pressure testing completed and recorded (water services, heated lines as required)",
      "Drainage testing completed where required (water test/air test per spec)",
      "Backflow devices tested/commissioned by authorised person; results recorded",
      "Hot water temperatures verified and recorded (TMVs set and tested)",
      "Leak checks completed at all joints/fixtures",
      "Pumps and controls tested (including power/interface by electrical as applicable)",
      "Defects logged and rectified"
    ]
  },
  documentationCertification: {
    title: "Documentation & Certification (Critical)",
    items: [
      "Test certificates compiled (pressure tests, drainage tests, backflow test sheets)",
      "Backflow prevention certification provided and asset register updated",
      "As-built drawings completed",
      "O&M manuals compiled (pumps, heaters, valves, backflow devices, controls)",
      "Warranties provided for fixtures and equipment",
      "Commissioning sheets provided (pumps, heaters, control valves)",
      "Producer Statements / compliance documentation prepared where contract requires (NZ councils often require PS3/PS4 depending on procurement; include 'where required by contract' wording)",
      "Maintenance schedules provided (filters, backflow retest intervals)"
    ]
  },
  finalHandover: {
    title: "Final Handover & Close-Out",
    items: [
      "Systems operational and demonstrated",
      "Final tie-ins completed and water services restored",
      "Training provided to FM/client (pumps, heaters, isolation locations, backflow maintenance)",
      "Defects list closed",
      "Variations agreed and finalised",
      "Final documentation accepted",
      "Practical Completion sign-off obtained"
    ]
  }
};
