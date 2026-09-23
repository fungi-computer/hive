// Executable state-discrimination counterexample, NOT a calibrated Richards solver.
// Two disjoint porous cells, one surface pond. No overlapping aquifer inventory.
import {writeFileSync} from 'node:fs';
const params={thetaR:.05,thetaS:.45,alpha:2,n:2,m:.5,Ks:1e-4,Ss:1e-3,bulkVolume:1,faceArea:1,ell:.25};
function theta(psi){return psi>=0?params.thetaS+params.Ss*psi:params.thetaR+(params.thetaS-params.thetaR)*(1+(params.alpha*Math.abs(psi))**params.n)**(-params.m);}
function inverse(w){if(w>=params.thetaS)return (w-params.thetaS)/params.Ss;const se=(w-params.thetaR)/(params.thetaS-params.thetaR);return -Math.sqrt(se**(-1/params.m)-1)/params.alpha;}
function conductivity(psi){if(psi>=0)return params.Ks;const se=(theta(psi)-params.thetaR)/(params.thetaS-params.thetaR);return params.Ks*Math.sqrt(se)*(1-(1-se**(1/params.m))**params.m)**2;}
function caseOf(name,top,bottom){
 const pond={bed:0,area:1,volume:.1},cells=[{z:-.25,psi:top,water:theta(top)},{z:-1.25,psi:bottom,water:theta(bottom)}];
 const Hpond=pond.bed+pond.volume/pond.area,Htop=cells[0].z+cells[0].psi;
 // Vented soil, isothermal water, infinitesimal Darcy tendency only.
 const Q=conductivity(top)*params.faceArea*(Hpond-Htop)/params.ell,dt=.1,dV=Q*dt;
 const before=pond.volume+cells[0].water+cells[1].water;
 const after={pond:pond.volume-dV,top:cells[0].water+dV,bottom:cells[1].water};
 return {name,pond,cells,cumulativeInfiltrationLabel:0,porousTotal:cells[0].water+cells[1].water,Hpond,Htop,conductivity:conductivity(top),signedPondToSoilM3PerS:Q,direction:Q>0?'infiltration':'exfiltration',afterPointOneSeconds:after,massError:after.pond+after.top+after.bottom-before};
}
const a=caseOf('dry-top-wet-bottom',-1,.5),b=caseOf('wet-top-dry-bottom',.5,-1);
const stockCompression={atZeroPressure:theta(0),atHalfMetrePressure:theta(.5),occupiedPoreVolumeBoth:params.thetaS*params.bulkVolume,extraReferenceDensityStockFromSpecificStorage:theta(.5)-theta(0)};
const result={scope:'Exact representation-discrimination and instantaneous Darcy tendencies; no integration/convergence/infiltration-performance or Richards validation claim',params,a,b,stockCompression,checks:{equalTotal:Math.abs(a.porousTotal-b.porousTotal)<1e-14,oppositeRequiredDirections:a.signedPondToSoilM3PerS*b.signedPondToSoilM3PerS<0,retentionRoundtrip:[-1,.5].every(p=>Math.abs(inverse(theta(p))-p)<1e-12),pairedBalance:[a,b].every(c=>Math.abs(c.massError)<1e-14)},implication:'A single soil/groundwater total or cumulative infiltration number maps both valid states to the same description yet must choose opposite surface exchange. Preserve disjoint porous distribution and retention/head, or explicitly decline reversed seepage. Saturated reference-density storage is not extra geometrical pore capacity.'};
writeFileSync(new URL('./groundwater-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
