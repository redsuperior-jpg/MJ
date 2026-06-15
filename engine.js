export function settle(round){
  let p = ["A","B","C","D"];
  let base = {A:0,B:0,C:0,D:0};
  let bird = {A:0,B:0,C:0,D:0};

  if(round.type==="DISCARD"){
    base[round.winner]+=round.base;
    base[round.loser]-=round.base;
  }else{
    base[round.winner]+=round.base*3;
    p.forEach(x=>{if(x!==round.winner) base[x]-=round.base});
  }

  let v = 50;
  let b = round.birds[0];
  for(let x of p){
    bird[x]+= (Number(b[x]||0))*v;
  }

  let final={A:0,B:0,C:0,D:0};
  let sum=0;
  for(let x of p){
    final[x]=base[x]+bird[x];
    sum+=final[x];
  }

  return {base,bird,final,sum};
}
