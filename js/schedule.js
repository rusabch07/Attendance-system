export const localDateKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export const weekdayNumber=(date=new Date())=>date.getDay()||7;
export const isValidDateKey=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(`${value}T00:00:00`);
 return !Number.isNaN(date.getTime())&&localDateKey(date)===value;
};

export const shortTime=value=>String(value||'').slice(0,5);

export function timeToMinutes(value){
 const [hours=0,minutes=0]=String(value||'').split(':').map(Number);
 return hours*60+minutes;
}

export function scheduleStatus(slot,now=new Date(),hasAttendance=false){
 if(hasAttendance)return 'completed';
 const current=now.getHours()*60+now.getMinutes();
 if(current<timeToMinutes(slot.start_time))return 'upcoming';
 if(current<timeToMinutes(slot.end_time))return 'current';
 return hasAttendance?'completed':'awaiting';
}

export function nextLectureNumber(lectures,subjectId,sectionId=null){
 const numbers=lectures.filter(lecture=>lecture.subject_id===subjectId&&(!sectionId||lecture.section_id===sectionId)).map(lecture=>Number(lecture.lecture_number)||0);
 return Math.max(0,...numbers)+1;
}

export function nextDateForWeekday(targetWeekday,fromDate=new Date()){
 const current=weekdayNumber(fromDate);
 let diff=targetWeekday-current;
 if(diff<0)diff+=7;
 const d=new Date(fromDate);
 d.setDate(d.getDate()+diff);
 return localDateKey(d);
}

export function getSlotException(exceptions=[],slotId,dateKey){
 return (exceptions||[]).find(ex=>ex.schedule_slot_id===slotId&&ex.exception_date===dateKey)||null;
}

export function isSlotScheduledForDate(slot,exceptions=[],dateKey){
 if(!slot||slot.is_active===false||!isValidDateKey(dateKey))return false;
 const date=new Date(`${dateKey}T00:00:00`);
 if(Number.isNaN(date.getTime())||localDateKey(date)!==dateKey)return false;
 if(exceptions.some(e=>e.schedule_slot_id===slot.id&&e.exception_type==='rescheduled'&&e.new_date===dateKey))return true;
 return weekdayNumber(date)===Number(slot.day_of_week)&&!getSlotException(exceptions,slot.id,dateKey);
}

export const remainingScheduleItems=items=>items.filter(item=>!item.lecture&&!item.exception&&item.status==='upcoming');

export function getRescheduledSlotsForDate(exceptions=[],timetable=[],dateKey){
 return (exceptions||[])
  .filter(ex=>ex.exception_type==='rescheduled'&&ex.new_date===dateKey)
  .map(ex=>{
   const slot=(timetable||[]).find(s=>s.id===ex.schedule_slot_id);
   if(!slot)return null;
   return {
    ...slot,
    is_rescheduled_instance:true,
    exception_id:ex.id,
    origin_date:ex.exception_date,
    origin_start_time:slot.start_time,
    origin_end_time:slot.end_time,
    start_time:ex.new_start_time||slot.start_time,
    end_time:ex.new_end_time||slot.end_time,
    room:ex.new_room||slot.room,
    exception_reason:ex.reason
   };
  })
  .filter(Boolean);
}

export function resolveTodayScheduleItems(data,now=new Date()){
 const dateKey=localDateKey(now);
 const timetable=data.timetable||[];
 const exceptions=data.schedule_exceptions||[];
 const lectures=data.lectures||[];
 const subjects=data.subjects||[];

 const regularSlots=timetable
  .filter(slot=>slot.is_active!==false&&Number(slot.day_of_week)===weekdayNumber(now));

 const items=[];

 regularSlots.forEach(slot=>{
  const subject=subjects.find(s=>s.id===slot.subject_id);
  const exception=getSlotException(exceptions,slot.id,dateKey);
  const lecture=lectures.find(item=>item.schedule_slot_id===slot.id&&item.lecture_date===dateKey);

  if(exception){
   if(exception.exception_type==='cancelled'){
    items.push({
     slot,
     subject,
     isRescheduled:false,
     exception,
     lecture:null,
     status:'cancelled',
     reason:exception.reason,
     displayTime:`${shortTime(slot.start_time)}–${shortTime(slot.end_time)}`,
     sortTime:slot.start_time
    });
    return;
   }
   if(exception.exception_type==='break'){
    items.push({
     slot,
     subject,
     isRescheduled:false,
     exception,
     lecture:null,
     status:'break',
     reason:exception.reason,
     displayTime:`${shortTime(slot.start_time)}–${shortTime(slot.end_time)}`,
     sortTime:slot.start_time
    });
    return;
   }
   if(exception.exception_type==='rescheduled'){
    items.push({
     slot,
     subject,
     isRescheduled:false,
     exception,
     lecture:null,
     status:'rescheduled',
     reason:exception.reason,
     rescheduledTo:{
      date:exception.new_date,
      start_time:exception.new_start_time,
      end_time:exception.new_end_time,
      room:exception.new_room
     },
     displayTime:`${shortTime(slot.start_time)}–${shortTime(slot.end_time)}`,
     sortTime:slot.start_time
    });
    return;
   }
  }

  const status=lecture?'taken':scheduleStatus(slot,now,false);
  items.push({
   slot,
   subject,
   isRescheduled:false,
   exception:null,
   lecture,
   status,
   displayTime:`${shortTime(slot.start_time)}–${shortTime(slot.end_time)}`,
   sortTime:slot.start_time
  });
 });

 const rescheduledIncoming=getRescheduledSlotsForDate(exceptions,timetable,dateKey);
 rescheduledIncoming.forEach(rescheduledSlot=>{
  const subject=subjects.find(s=>s.id===rescheduledSlot.subject_id);
  const lecture=lectures.find(item=>item.schedule_slot_id===rescheduledSlot.id&&item.lecture_date===dateKey);
  const status=lecture?'taken':scheduleStatus(rescheduledSlot,now,false);
  items.push({
   slot:rescheduledSlot,
   subject,
   isRescheduled:true,
   exception:exceptions.find(e=>e.id===rescheduledSlot.exception_id),
   lecture,
   status,
   displayTime:`${shortTime(rescheduledSlot.start_time)}–${shortTime(rescheduledSlot.end_time)}`,
   sortTime:rescheduledSlot.start_time,
   reason:rescheduledSlot.exception_reason,
   rescheduledFrom:{
    date:rescheduledSlot.origin_date,
    start_time:rescheduledSlot.origin_start_time,
    end_time:rescheduledSlot.origin_end_time
   }
  });
 });

 return items.sort((a,b)=>String(a.sortTime).localeCompare(String(b.sortTime)));
}
