export const localDateKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export const weekdayNumber=(date=new Date())=>date.getDay()||7;

export const shortTime=value=>String(value||'').slice(0,5);

export function timeToMinutes(value){
 const [hours=0,minutes=0]=String(value||'').split(':').map(Number);
 return hours*60+minutes;
}

export function scheduleStatus(slot,now=new Date(),hasAttendance=false){
 const current=now.getHours()*60+now.getMinutes();
 if(current<timeToMinutes(slot.start_time))return 'upcoming';
 if(current<timeToMinutes(slot.end_time))return 'current';
 return hasAttendance?'completed':'awaiting';
}

export function nextLectureNumber(lectures,subjectId){
 const numbers=lectures.filter(lecture=>lecture.subject_id===subjectId).map(lecture=>Number(lecture.lecture_number)||0);
 return Math.max(0,...numbers)+1;
}
