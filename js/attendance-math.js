// Missing settings retain the existing 75% / exclude_leave defaults.
export function getSectionAttendancePolicy(data,sectionId){
 const settings=data.settings_rows?.find(row=>row.section_id===sectionId)
  || (data.settings?.section_id===sectionId||!data.settings_rows ? data.settings : null) || {};
 return {minimumAttendance:Number(settings.minimum_attendance||75),leavePolicy:settings.leave_calculation_policy||'exclude_leave'};
}

export function sectionAttendanceStats(data,rows,sectionId){
 const policy=getSectionAttendancePolicy(data,sectionId);
 const stats=attendanceStats(rows,policy.leavePolicy);
 return {...stats,...policy,belowThreshold:stats.percentage<policy.minimumAttendance};
}

// A mixed-policy total has valid raw counts, but no common percentage.
export function aggregateAttendanceStats(data,rows){
 const policies=new Set(rows.map(row=>getSectionAttendancePolicy(data,data.students.find(s=>s.id===row.student_id)?.section_id||data.lectures.find(l=>l.id===row.lecture_id)?.section_id).leavePolicy));
 return {...attendanceStats(rows,[...policies][0]),...(policies.size>1?{percentage:null}: {})};
}

export const attendancePercentageLabel=value=>value===null?'Section-specific':`${value}%`;

export function attendanceStats(rowsOrCounts,policy='exclude_leave'){
 const counts=Array.isArray(rowsOrCounts)?rowsOrCounts.reduce((result,row)=>{if(row.status==='present')result.present++;else if(row.status==='absent')result.absent++;else if(row.status==='leave')result.leave++;return result},{present:0,absent:0,leave:0}):rowsOrCounts||{};
 const present=Number(counts.present)||0,absent=Number(counts.absent)||0,leave=Number(counts.leave)||0;
 const denominator=present+absent+(policy==='count_leave_as_absent'?leave:0);
 return{present,absent,leave,total:present+absent+leave,percentage:denominator?+(present*100/denominator).toFixed(1):0};
}

export function applyApprovedLeaves(statuses,students,leaves,date){
 for(const student of students){
  if((leaves||[]).some(leave=>leave.student_id===student.id&&leave.status==='approved'&&leave.start_date<=date&&leave.end_date>=date))statuses.set(student.id,'leave');
 }
 return statuses;
}

export function attendanceRoster(students,attendance,editingId=null){
 if(!editingId)return students;
 const ids=new Set(attendance.filter(row=>row.lecture_id===editingId).map(row=>row.student_id));
 return students.filter(student=>ids.has(student.id));
}
