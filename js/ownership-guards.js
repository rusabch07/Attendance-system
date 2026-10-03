// Frontend/demo feedback only. Migration 090 is the authoritative enforcement.
export function studentReassignmentError(data,studentId,sectionId){
 const student=data.students.find(row=>row.id===studentId);
 if(!student||student.section_id===sectionId)return '';
 if(data.attendance.some(row=>row.student_id===studentId&&data.lectures.find(lecture=>lecture.id===row.lecture_id)?.section_id!==sectionId)){
  return 'Cannot move student to another section because attendance history exists in a different section.';
 }
 if(data.leaves.some(row=>row.student_id===studentId&&row.section_id!==sectionId)){
  return 'Cannot move student to another section because leave records exist in a different section.';
 }
 return '';
}

export function subjectReassignmentError(data,subjectId,groupId){
 const subject=data.subjects.find(row=>row.id===subjectId);
 if(!subject||subject.academic_group_id===groupId)return '';
 if(data.timetable.some(row=>row.subject_id===subjectId)||data.lectures.some(row=>row.subject_id===subjectId)){
  return 'Cannot move subject to another academic group because timetable or lecture records reference it.';
 }
 return '';
}
