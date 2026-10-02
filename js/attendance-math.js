export function attendanceStats(rowsOrCounts,policy='exclude_leave'){
 const counts=Array.isArray(rowsOrCounts)?rowsOrCounts.reduce((result,row)=>{if(row.status==='present')result.present++;else if(row.status==='absent')result.absent++;else if(row.status==='leave')result.leave++;return result},{present:0,absent:0,leave:0}):rowsOrCounts||{};
 const present=Number(counts.present)||0,absent=Number(counts.absent)||0,leave=Number(counts.leave)||0;
 const denominator=present+absent+(policy==='count_leave_as_absent'?leave:0);
 return{present,absent,leave,total:present+absent+leave,percentage:denominator?+(present*100/denominator).toFixed(1):0};
}