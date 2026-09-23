// Independent continuum reference, not assembled from the numerical stencil.
export const H=2.16,W=2,A=.1,NU=.1;
export function steady(y,z,cutoff=511){
  let correction=0;
  for(let m=1;m<=cutoff;m+=2){
    const k=m*Math.PI/H;
    const ratio=(Math.exp(k*(z-W))+Math.exp(-k*z))/(1+Math.exp(-k*W));
    correction+=Math.sin(k*y)*ratio/(m*m*m);
  }
  return A*y*(H-y)/(2*NU)-4*A*H*H/(NU*Math.PI**3)*correction;
}
export function transient(y,z,t,cutoff=127){
  let deficit=0;
  for(let m=1;m<=cutoff;m+=2)for(let n=1;n<=cutoff;n+=2){
    const lambda=Math.PI**2*(m*m/(H*H)+n*n/(W*W));
    deficit+=16*A/(NU*Math.PI**2*m*n*lambda)*Math.sin(m*Math.PI*y/H)*Math.sin(n*Math.PI*z/W)*Math.exp(-NU*lambda*t);
  }
  return deficit;
}
export const startup=(y,z,t,steadyCutoff=511,transientCutoff=127)=>steady(y,z,steadyCutoff)-transient(y,z,t,transientCutoff);
export function modalAlgebra(m,n,t){
  const lambda=Math.PI**2*(m*m/(H*H)+n*n/(W*W)),forcing=16*A/(Math.PI**2*m*n);
  const coefficient=forcing/(NU*lambda)*(-Math.expm1(-NU*lambda*t));
  const derivative=forcing*Math.exp(-NU*lambda*t);
  return {initial:forcing/(NU*lambda)*(-Math.expm1(0)),residual:derivative-forcing+NU*lambda*coefficient};
}
