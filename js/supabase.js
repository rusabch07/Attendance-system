import {SUPABASE_URL,SUPABASE_ANON_KEY,configured} from './config.js';
import {clearAdminFilterContext,getCurrentUserContext} from './access-context.js';
import {localDateKey,isSlotScheduledForDate,isValidDateKey} from './schedule.js';
import {studentReassignmentError,subjectReassignmentError} from './ownership-guards.js';

const demo = new URLSearchParams(location.search).get('demo') === '1';
const qs = demo ? '?demo=1' : '';
const client = configured && window.supabase ? window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
const uid=()=>crypto.randomUUID();

const demoLeaves=()=>{try{return JSON.parse(localStorage.getItem('attendance-demo-leaves-v1')||'[]')}catch{return[]}};
const persistDemoLeaves=()=>localStorage.setItem('attendance-demo-leaves-v1',JSON.stringify(demoState.leaves));
const demoExceptions=()=>{try{return JSON.parse(localStorage.getItem('attendance-demo-exceptions-v1')||'[]')}catch{return[]}};
const persistDemoExceptions=()=>localStorage.setItem('attendance-demo-exceptions-v1',JSON.stringify(demoState.schedule_exceptions));

const daysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return localDateKey(d)};

// Demo Academic Groups & Sections
const academic_groups = [
  { id: 'ag-1', department: 'Electrical Engineering', batch: '2025', semester: 'Semester 2', is_active: true }
];

const sections = [
  { id: 'sec-1', academic_group_id: 'ag-1', section_name: 'Section A', section_code: 'EE-25-A', department: 'Electrical Engineering', batch: '2025', semester: 'Semester 2', login_id: 'EE-25-A', is_active: true },
  { id: 'sec-2', academic_group_id: 'ag-1', section_name: 'Section B', section_code: 'EE-25-B', department: 'Electrical Engineering', batch: '2025', semester: 'Semester 2', login_id: 'EE-25-B', is_active: true }
];

// Section A & Section B Students
const students=[
  ['2025-EE-321','REG-25-321','Ali Hassan','A','2','ali@example.com','0300-1111111','sec-1'],
  ['2025-EE-322','REG-25-322','Ahmed Raza','A','2','ahmed@example.com','0300-2222222','sec-1'],
  ['2025-EE-323','REG-25-323','Usman Khan','A','2','usman@example.com','0300-3333333','sec-1'],
  ['2025-EE-324','REG-25-324','Shams Ul Haq','A','2','','','sec-1'],
  ['2025-EE-325','REG-25-325','Rusab Ali','A','2','','','sec-1'],
  ['2025-EE-326','REG-25-326','Hamza Siddiqui','A','2','','','sec-1'],
  ['2025-EE-327','REG-25-327','Bilal Ahmed','A','2','','','sec-1'],
  ['2025-EE-328','REG-25-328','Zain Malik','A','2','','','sec-1'],
  ['2025-EE-351','REG-25-351','Danish Khan','B','2','danish@example.com','0300-4444444','sec-2'],
  ['2025-EE-352','REG-25-352','Saad Tariq','B','2','saad@example.com','0300-5555555','sec-2'],
  ['2025-EE-353','REG-25-353','Faizan Ali','B','2','faizan@example.com','0300-6666666','sec-2'],
  ['2025-EE-354','REG-25-354','Mustafa Kamal','B','2','','','sec-2'],
  ['2025-EE-355','REG-25-355','Hassan Nawaz','B','2','','','sec-2'],
  ['2025-EE-356','REG-25-356','Waleed Javed','B','2','','','sec-2']
].map((x,i)=>({
  id:`stu-${i+1}`,
  roll_no:x[0],
  registration_no:x[1],
  name:x[2],
  section:x[3],
  semester:x[4],
  email:x[5],
  phone:x[6],
  section_id:x[7],
  created_at:new Date().toISOString()
}));

// Shared Subjects for Academic Group 1 (Electrical Engineering 2025 Semester 2)
const subjects=[
  ['Electric Machinery Fundamentals','EE-302','Dr. Ayesha Malik','2','Shared',3,'ag-1'],
  ['Electronic Devices & Circuits','EE-304','Engr. Hassan Rafiq','2','Shared',3,'ag-1'],
  ['Linear Algebra','MTH-221','Dr. Nadia Saeed','2','Shared',3,'ag-1'],
  ['Circuit Analysis','EE-306','Engr. Omer Farooq','2','Shared',4,'ag-1'],
  ['Engineering Mathematics','MTH-201','Dr. Sara Khan','2','Shared',3,'ag-1']
].map((x,i)=>({
  id:`sub-${i+1}`,
  subject_name:x[0],
  subject_code:x[1],
  teacher_name:x[2],
  semester:x[3],
  section:x[4],
  credit_hours:x[5],
  academic_group_id:x[6],
  created_at:new Date().toISOString()
}));

// Section A & Section B Timetable Slots
const timetable=[
  // Section A
  [1,0,'A','08:00:00','09:00:00','EE-101',true,'sec-1'],
  [1,1,'A','09:00:00','10:00:00','EE-102',true,'sec-1'],
  [1,2,'A','11:00:00','12:00:00','EE-103',true,'sec-1'],
  [2,3,'A','08:00:00','09:00:00','EE-104',true,'sec-1'],
  [2,4,'A','09:00:00','10:00:00','EE-105',true,'sec-1'],
  [3,1,'A','08:00:00','09:00:00','EE-101',true,'sec-1'],
  [4,0,'A','10:00:00','11:00:00','EE-102',true,'sec-1'],
  [5,2,'A','08:00:00','09:00:00','EE-103',true,'sec-1'],
  [5,3,'A','13:00:00','14:00:00',null,false,'sec-1'],
  // Section B
  [1,0,'B','10:00:00','11:00:00','EE-104',true,'sec-2'],
  [1,1,'B','11:00:00','12:00:00','EE-105',true,'sec-2'],
  [2,2,'B','09:00:00','10:00:00','EE-101',true,'sec-2'],
  [3,3,'B','10:00:00','11:00:00','EE-102',true,'sec-2'],
  [4,4,'B','08:00:00','09:00:00','EE-103',true,'sec-2'],
  [5,0,'B','11:00:00','12:00:00','EE-105',true,'sec-2']
].map((x,i)=>({
  id:`slot-${i+1}`,
  day_of_week:x[0],
  subject_id:subjects[x[1]].id,
  section:x[2],
  start_time:x[3],
  end_time:x[4],
  room:x[5],
  is_active:x[6],
  section_id:x[7],
  created_at:new Date().toISOString()
}));

const getStoredDemoAuth=()=>{
  try{
    const val=sessionStorage.getItem('attendance_demo_auth_v1');
    if(val)return JSON.parse(val);
  }catch{}
  return {
    user:{id:'admin-user',email:'admin@university.edu'},
    profile:{id:'prof-admin',name:'Faculty Administrator',role:'admin',user_id:'admin-user',section_id:null}
  };
};

const demoAuth=getStoredDemoAuth();

const demoState={
  academic_groups,
  sections,
  students,
  subjects,
  lectures:[],
  attendance:[],
  leaves:demoLeaves(),
  schedule_exceptions:demoExceptions(),
  timetable,
  settings:{
    id:'set-1',
    class_name:'Electrical Engineering 2025',
    semester_name:'Semester 2',
    university_name:'National University',
    minimum_attendance:75,
    leave_calculation_policy:'exclude_leave'
  },
  profile:demoAuth.profile
};

// Seed Section A Lectures & Attendance
for(let s=0;s<subjects.length;s++){
  for(let l=1;l<=Math.max(4,9-s);l++){
    const lecture={
      id:`lec-a-${s+1}-${l}`,
      subject_id:subjects[s].id,
      lecture_number:l,
      lecture_date:daysAgo((9-l)*2+s),
      section:'A',
      section_id:'sec-1',
      schedule_slot_id:null,
      created_by:'demo-user',
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
    demoState.lectures.push(lecture);
    students.filter(st=>st.section_id==='sec-1').forEach((st,i)=>{
      demoState.attendance.push({
        id:uid(),
        lecture_id:lecture.id,
        student_id:st.id,
        status:((i+s+l)%7===0||(i===3&&s===3&&l%2===0))?'absent':'present',
        marked_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      });
    });
  }
}

// Seed Section B Lectures & Attendance
for(let s=0;s<subjects.length;s++){
  for(let l=1;l<=Math.max(3,7-s);l++){
    const lecture={
      id:`lec-b-${s+1}-${l}`,
      subject_id:subjects[s].id,
      lecture_number:l,
      lecture_date:daysAgo((7-l)*2+s+1),
      section:'B',
      section_id:'sec-2',
      schedule_slot_id:null,
      created_by:'demo-user',
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
    demoState.lectures.push(lecture);
    students.filter(st=>st.section_id==='sec-2').forEach((st,i)=>{
      demoState.attendance.push({
        id:uid(),
        lecture_id:lecture.id,
        student_id:st.id,
        status:((i+s+l)%6===0)?'absent':'present',
        marked_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      });
    });
  }
}

function check(res){if(res.error)throw res.error;return res.data}
function attendanceSaveError(error){
 const messages={
  '23505':'Attendance already exists for this lecture or timetable occurrence.',
  '23514':'Attendance could not be saved because its section, schedule, or student data is invalid.',
  '23503':'Attendance could not be saved because a referenced record no longer exists.',
  '42501':'You do not have permission to save attendance for this section.',
  '22023':'Attendance could not be saved because the submitted details are invalid.',
  '22P02':'Attendance could not be saved because the submitted details are invalid.',
  'P0002':'The attendance record was not found or is no longer available.'
 };
 const safe=new Error(messages[error?.code]||'Attendance could not be saved. Please reload and try again.');
 safe.code=error?.code;
 return safe;
}
const demoStorageKey='attendance-demo-state-v2';
if(demo){
  try{const saved=JSON.parse(localStorage.getItem(demoStorageKey)||'null');if(saved){for(const key of ['students','subjects','lectures','attendance','timetable','leaves','schedule_exceptions','settings_rows'])if(Array.isArray(saved[key]))demoState[key]=saved[key];}}
  catch{ /* Ignore damaged demo storage; production is never stored here. */ }
  demoState.settings_rows ||= sections.map(section=>({...demoState.settings,id:`settings-${section.id}`,section_id:section.id}));
}
async function table(name){return check(await client.from(name).select('*'))}
async function optionalTable(name){const result=await client.from(name).select('*');if(result.error?.code==='42P01'||result.error?.code==='PGRST205')return[];return check(result)}

export const DB={
  demo,configured,isReady:demo||configured,qs,

  async resolveLoginEmail(identifier, requestedRole='admin'){
    if(!identifier)return null;
    const cleanId=String(identifier).trim();
    if(cleanId.includes('@'))return cleanId;

    if(demo){
      if(requestedRole==='admin'){
        if(cleanId.toLowerCase().includes('cr')||cleanId.toLowerCase().startsWith('ee-')){
          return 'cr.ee-25-a@university.edu'; // Will trigger role check error
        }
        return 'admin@university.edu';
      }
      // CR role requested
      const lower=cleanId.toLowerCase();
      if(lower==='ee-25-a'||lower==='ee-a-01'||lower==='a'||lower==='cr-a'||lower==='cr'){
        return 'cr.ee-25-a@university.edu';
      }
      if(lower==='ee-25-b'||lower==='ee-b-01'||lower==='b'||lower==='cr-b'){
        return 'cr.ee-25-b@university.edu';
      }
      if(lower.includes('admin')){
        return 'admin@university.edu'; // Will trigger role check error
      }
      return null;
    }

    if(!client)return null;
    try{
      if(requestedRole==='cr'){
        const res=await client.rpc('get_cr_login_email',{p_login_id:cleanId});
        if(res.data)return res.data;
      }else{
        const res=await client.rpc('get_admin_login_email',{p_admin_id:cleanId});
        if(res.data)return res.data;
      }
    }catch(err){
      console.warn('RPC lookup failed:',err);
    }
    return null;
  },

  async signIn(identifier,password,requestedRole='admin'){
    const cleanId=String(identifier||'').trim();
    if(!cleanId)throw new Error('Please enter your login identifier.');
    if(!password)throw new Error('Please enter your password.');

    const resolvedEmail=await this.resolveLoginEmail(cleanId,requestedRole);
    if(!resolvedEmail){
      if(requestedRole==='cr'){
        throw new Error(`Section Login ID "${cleanId}" not found. Please verify your Section Login ID or contact the Administrator.`);
      }else{
        throw new Error(`Admin account "${cleanId}" not found. Please verify your email or Admin ID.`);
      }
    }

    if(demo){
      let targetProfile;
      if(resolvedEmail.includes('admin')){
        targetProfile={id:'prof-admin',name:'Faculty Administrator',role:'admin',user_id:'admin-user',section_id:null};
      }else if(resolvedEmail.includes('ee-25-b')){
        targetProfile={id:'prof-cr-b',name:'Danish Khan (CR B)',role:'cr',user_id:'cr-user-b',section_id:'sec-2'};
      }else{
        targetProfile={id:'prof-cr-a',name:'Ali Hassan (CR A)',role:'cr',user_id:'cr-user-a',section_id:'sec-1'};
      }

      if(requestedRole==='admin'&&targetProfile.role!=='admin'){
        throw new Error('This account is not an Admin account.');
      }
      if(requestedRole==='cr'&&targetProfile.role!=='cr'){
        throw new Error('This account is not a CR account.');
      }

      const demoSession={
        user:{id:targetProfile.user_id,email:resolvedEmail},
        profile:targetProfile
      };
      sessionStorage.setItem('attendance_demo_auth_v1',JSON.stringify(demoSession));
      sessionStorage.removeItem('attendance_demo_logged_out');
      demoState.profile=targetProfile;
      return demoSession;
    }

    if(!client)throw new Error('Supabase client not configured.');

    const authRes=check(await client.auth.signInWithPassword({email:resolvedEmail,password}));
    const userId=authRes.user?.id;

    // Read profile to verify role
    const profileRes=await client.from('profiles').select('*').eq('user_id',userId).maybeSingle();
    const profile=profileRes.data||{};

    if(requestedRole==='admin'&&profile.role!=='admin'){
      await client.auth.signOut();
      throw new Error('This account is not an Admin account.');
    }
    if(requestedRole==='cr'&&profile.role!=='cr'){
      await client.auth.signOut();
      throw new Error('This account is not a CR account.');
    }

    if(profile.role==='cr'){
      const section=check(await client.from('sections').select('id,is_active').eq('id',profile.section_id).maybeSingle());
      if(!section||section.is_active===false){await client.auth.signOut();throw new Error('Your section is unavailable or inactive. Contact the Administrator.');}
    }

    return authRes;
  },

  async signOut(){
    clearAdminFilterContext();
    if(demo){
      sessionStorage.removeItem('attendance_demo_auth_v1');
      sessionStorage.setItem('attendance_demo_logged_out','1');
      return;
    }
    if(client)await client.auth.signOut();
  },

  async session(){
    if(demo){
      if(sessionStorage.getItem('attendance_demo_logged_out'))return null;
      const a=getStoredDemoAuth();
      return {user:a.user};
    }
    if(!client)return null;
    return (await client.auth.getSession()).data.session;
  },

  async user(){
    if(demo){
      const a=getStoredDemoAuth();
      return a.user;
    }
    const s=await this.session();
    return s?.user||null;
  },

  async all(){
    if(demo){
      const a=getStoredDemoAuth();
      demoState.profile=a.profile;
      const context=getCurrentUserContext(demoState),sectionId=context.activeSectionId;
      demoState.settings=demoState.settings_rows.find(s=>s.section_id===sectionId)||{};
      const result=structuredClone(demoState);
      if(context.isCR){
       for(const key of ['students','lectures','timetable','leaves','schedule_exceptions','settings_rows'])result[key]=result[key].filter(row=>row.section_id===sectionId);
       result.sections=result.sections.filter(s=>s.id===sectionId);
       result.academic_groups=result.academic_groups.filter(g=>g.id===context.activeGroupId);
       result.subjects=result.subjects.filter(s=>s.academic_group_id===context.activeGroupId);
       const lectureIds=new Set(result.lectures.map(l=>l.id));
       result.attendance=result.attendance.filter(a=>lectureIds.has(a.lecture_id));
      }
      return result;
    }
    const [students,subjects,lectures,attendance,timetable,leaves,settings,profiles,schedule_exceptions,sectionsRes,academicGroupsRes]=await Promise.all([
      table('students'),
      table('subjects'),
      table('lectures'),
      table('attendance'),
      optionalTable('timetable'),
      optionalTable('student_leaves'),
      table('settings'),
      table('profiles'),
      optionalTable('schedule_exceptions'),
      optionalTable('sections'),
      optionalTable('academic_groups')
    ]);
    const u=await this.user();
    const profile=profiles.find(p=>p.user_id===u?.id);
    if(!profile||!['admin','cr'].includes(profile.role))throw new Error('Your account has no authorized attendance profile.');
    if(profile.role==='cr'&&!sectionsRes.some(s=>s.id===profile.section_id&&s.is_active!==false))throw new Error('Your section is unavailable or inactive.');
    const context=getCurrentUserContext({profile,sections:sectionsRes,academic_groups:academicGroupsRes});
    return {
      students,
      subjects,
      lectures,
      attendance,
      timetable,
      leaves,
      schedule_exceptions:schedule_exceptions||[],
      settings:settings.find(s=>s.section_id===context.activeSectionId)||{},
      settings_rows:settings,
      profile,
      sections:sectionsRes||[],
      academic_groups:academicGroupsRes||[]
    };
  },

  async addStudent(row){
    if(demo){
      if(demoState.students.some(x=>x.roll_no===row.roll_no))throw new Error('Roll number already exists.');
      const v={...row,id:uid(),created_at:new Date().toISOString()};
      demoState.students.push(v);
      return v;
    }
    return check(await client.from('students').insert(row).select().single());
  },

  async updateStudent(id,row){
    if(demo){
      Object.assign(demoState.students.find(x=>x.id===id),row);
      return;
    }
    return check(await client.from('students').update(row).eq('id',id));
  },

  async deleteStudent(id){
    if(demo){
      demoState.students=demoState.students.filter(x=>x.id!==id);
      demoState.attendance=demoState.attendance.filter(x=>x.student_id!==id);
      demoState.leaves=demoState.leaves.filter(x=>x.student_id!==id);
      persistDemoLeaves();
      return;
    }
    return check(await client.from('students').delete().eq('id',id));
  },

  async addSubject(row){
    if(demo){
      if(demoState.subjects.some(x=>x.subject_code===row.subject_code&&x.academic_group_id===row.academic_group_id))throw new Error('Subject code already exists in this academic group.');
      const v={...row,id:uid(),created_at:new Date().toISOString()};
      demoState.subjects.push(v);
      return v;
    }
    return check(await client.from('subjects').insert(row).select().single());
  },

  async updateSubject(id,row){
    if(demo){
      Object.assign(demoState.subjects.find(x=>x.id===id),row);
      return;
    }
    return check(await client.from('subjects').update(row).eq('id',id));
  },

  async deleteSubject(id){
    if(demo){
      const lectureIds=demoState.lectures.filter(x=>x.subject_id===id).map(x=>x.id);
      demoState.subjects=demoState.subjects.filter(x=>x.id!==id);
      const slotIds=new Set(demoState.timetable.filter(x=>x.subject_id===id).map(x=>x.id));
      demoState.timetable=demoState.timetable.filter(x=>x.subject_id!==id);
      demoState.schedule_exceptions=demoState.schedule_exceptions.filter(x=>!slotIds.has(x.schedule_slot_id));
      persistDemoExceptions();
      demoState.lectures=demoState.lectures.filter(x=>x.subject_id!==id);
      demoState.attendance=demoState.attendance.filter(x=>!lectureIds.includes(x.lecture_id));
      return;
    }
    return check(await client.from('subjects').delete().eq('id',id));
  },

  async findDuplicate(subject_id,lecture_date,lecture_number,section_id=null){
    if(demo)return demoState.lectures.find(x=>x.subject_id===subject_id&&x.lecture_date===lecture_date&&Number(x.lecture_number)===Number(lecture_number)&&(!section_id||!x.section_id||x.section_id===section_id))||null;
    let query=client.from('lectures').select('*').eq('subject_id',subject_id).eq('lecture_date',lecture_date).eq('lecture_number',lecture_number);
    if(section_id)query=query.eq('section_id',section_id);
    return check(await query.maybeSingle());
  },

  async findScheduledLecture(lecture_date,schedule_slot_id){
    if(!schedule_slot_id)return null;
    if(demo)return demoState.lectures.find(x=>x.lecture_date===lecture_date&&x.schedule_slot_id===schedule_slot_id)||null;
    const r=await client.from('lectures').select('*').eq('lecture_date',lecture_date).eq('schedule_slot_id',schedule_slot_id).maybeSingle();
    return check(r);
  },

  async saveLecture(meta,statuses){
    if(demo){
      const u=await this.user();
      if(meta.schedule_slot_id&&await this.findScheduledLecture(meta.lecture_date,meta.schedule_slot_id)){
        const error=new Error('Attendance has already been taken for this timetable slot.');
        error.code='23505';
        throw error;
      }
      const lecture={...meta,schedule_slot_id:meta.schedule_slot_id||null,id:uid(),created_by:u.id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      demoState.lectures.push(lecture);
      statuses.forEach(x=>demoState.attendance.push({id:uid(),lecture_id:lecture.id,student_id:x.student_id,status:x.status,marked_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
      return lecture;
    }
    try{
      return check(await client.rpc('save_attendance_transaction',{
        p_lecture_id:null,
        p_subject_id:meta.subject_id,
        p_lecture_date:meta.lecture_date,
        p_lecture_number:meta.lecture_number,
        p_section:meta.section,
        p_section_id:meta.section_id,
        p_schedule_slot_id:meta.schedule_slot_id||null,
        p_attendance:statuses
      }));
    }catch(error){
      throw attendanceSaveError(error);
    }
  },

  async updateLecture(id,meta,statuses){
    if(demo){
      const scheduled=meta.schedule_slot_id&&demoState.lectures.find(x=>x.id!==id&&x.lecture_date===meta.lecture_date&&x.schedule_slot_id===meta.schedule_slot_id);
      if(scheduled){
        const error=new Error('Attendance has already been taken for this timetable slot.');
        error.code='23505';
        throw error;
      }
      Object.assign(demoState.lectures.find(x=>x.id===id),meta,{schedule_slot_id:meta.schedule_slot_id||null,updated_at:new Date().toISOString()});
      statuses.forEach(x=>{
        const a=demoState.attendance.find(y=>y.lecture_id===id&&y.student_id===x.student_id);
        if(a)Object.assign(a,{status:x.status,updated_at:new Date().toISOString()});
        else demoState.attendance.push({id:uid(),lecture_id:id,student_id:x.student_id,status:x.status,marked_at:new Date().toISOString(),updated_at:new Date().toISOString()});
      });
      return;
    }
    try{
      return check(await client.rpc('save_attendance_transaction',{
        p_lecture_id:id,
        p_subject_id:meta.subject_id,
        p_lecture_date:meta.lecture_date,
        p_lecture_number:meta.lecture_number,
        p_section:meta.section,
        p_section_id:meta.section_id,
        p_schedule_slot_id:meta.schedule_slot_id||null,
        p_attendance:statuses
      }));
    }catch(error){
      throw attendanceSaveError(error);
    }
  },

  async deleteLecture(id){
    if(demo){
      demoState.lectures=demoState.lectures.filter(x=>x.id!==id);
      demoState.attendance=demoState.attendance.filter(x=>x.lecture_id!==id);
      return;
    }
    return check(await client.from('lectures').delete().eq('id',id));
  },

  async addTimetableSlot(row){
    if(demo){
      const value={...row,id:uid(),created_at:new Date().toISOString()};
      demoState.timetable.push(value);
      return value;
    }
    return check(await client.from('timetable').insert(row).select().single());
  },

  async updateTimetableSlot(id,row){
    if(demo){
      Object.assign(demoState.timetable.find(x=>x.id===id),row);
      return;
    }
    return check(await client.from('timetable').update(row).eq('id',id));
  },

  async deleteTimetableSlot(id){
    if(demo){
      demoState.timetable=demoState.timetable.filter(x=>x.id!==id);
      demoState.schedule_exceptions=demoState.schedule_exceptions.filter(x=>x.schedule_slot_id!==id);
      demoState.lectures.forEach(l=>{if(l.schedule_slot_id===id)l.schedule_slot_id=null});
      persistDemoExceptions();
      return;
    }
    return check(await client.from('timetable').delete().eq('id',id));
  },

  async addScheduleException(row){
    const u=await this.user();
    if(demo){
      const ex={...row,id:uid(),created_by:u.id,created_at:new Date().toISOString()};
      const idx=demoState.schedule_exceptions.findIndex(x=>x.schedule_slot_id===row.schedule_slot_id&&x.exception_date===row.exception_date);
      if(idx>=0)demoState.schedule_exceptions[idx]=ex;
      else demoState.schedule_exceptions.push(ex);
      persistDemoExceptions();
      return ex;
    }
    const payload={...row,created_by:u.id};
    const existing=await client.from('schedule_exceptions').select('id').eq('schedule_slot_id',row.schedule_slot_id).eq('exception_date',row.exception_date).maybeSingle();
    if(existing?.data?.id)return check(await client.from('schedule_exceptions').update(payload).eq('id',existing.data.id).select().single());
    return check(await client.from('schedule_exceptions').insert(payload).select().single());
  },

  async deleteScheduleException(id){
    if(demo){
      demoState.schedule_exceptions=demoState.schedule_exceptions.filter(x=>x.id!==id);
      persistDemoExceptions();
      return;
    }
    return check(await client.from('schedule_exceptions').delete().eq('id',id));
  },

  async addLeave(row){
    if(demo){
      const leave={...row,id:uid(),status:'pending',created_at:new Date().toISOString(),approved_at:null,approved_by:null};
      demoState.leaves.push(leave);
      persistDemoLeaves();
      return leave;
    }
    return check(await client.from('student_leaves').insert({...row,status:'pending'}).select().single());
  },

  async updateLeaveStatus(id,status){
    const approved=status==='approved',row={status,approved_at:approved?new Date().toISOString():null,approved_by:approved?(await this.user()).id:null};
    if(demo){
      Object.assign(demoState.leaves.find(item=>item.id===id),row);
      persistDemoLeaves();
      return;
    }
    return check(await client.from('student_leaves').update(row).eq('id',id));
  },

  async saveSettings(row){
    if(demo){
      const sectionId=getCurrentUserContext(demoState).activeSectionId;
      if(!sectionId)throw new Error('Select a specific section to save class settings.');
      const settings=demoState.settings_rows.find(s=>s.section_id===sectionId);
      Object.assign(settings,row);
      return;
    }
    const data=await this.all(),sectionId=getCurrentUserContext(data).activeSectionId;
    if(!sectionId)throw new Error('Select a specific section to save class settings.');
    const existing=data.settings_rows.filter(s=>s.section_id===sectionId);
    if(existing.length>1)throw new Error('Multiple settings records exist for this section. Contact the Administrator.');
    if(existing[0])return check(await client.from('settings').update(row).eq('id',existing[0].id));
    return check(await client.from('settings').insert({...row,section_id:sectionId}));
  },

  async saveProfile(name){
    if(demo){
      demoState.profile.name=name;
      const cur=getStoredDemoAuth();
      cur.profile.name=name;
      sessionStorage.setItem('attendance_demo_auth_v1',JSON.stringify(cur));
      return;
    }
    const u=await this.user();
    return check(await client.from('profiles').update({name}).eq('user_id',u.id));
  },

  async changePassword(password){
    if(demo)return;
    return check(await client.auth.updateUser({password}));
  }
};

// Persist demo mutations so navigation and refresh exercise the same records.
// These guards emulate database ownership rules; production security remains RLS.
for(const name of ['addStudent','updateStudent','deleteStudent','addSubject','updateSubject','deleteSubject','saveLecture','updateLecture','deleteLecture','addTimetableSlot','updateTimetableSlot','deleteTimetableSlot','addScheduleException','deleteScheduleException','addLeave','updateLeaveStatus','saveSettings']){
 const original=DB[name];
 DB[name]=async function(...args){
  const fields={addStudent:['name','roll_no','registration_no','semester'],updateStudent:['name','roll_no','registration_no','semester'],addSubject:['subject_name','subject_code','teacher_name','semester'],updateSubject:['subject_name','subject_code','teacher_name','semester'],addLeave:['reason']};
  if(fields[name]){
   const index=name.startsWith('update')?1:0;
   args[index]={...args[index]};
   for(const field of fields[name])if(field in args[index]){args[index][field]=String(args[index][field]).trim();if(!args[index][field])throw new Error(`${field.replaceAll('_',' ')} cannot be blank.`);}
  }
  if(demo){
   const context=getCurrentUserContext(demoState);
   const tables={Student:'students',Subject:'subjects',Lecture:'lectures',TimetableSlot:'timetable',ScheduleException:'schedule_exceptions',Leave:'leaves'};
   const kind=Object.keys(tables).find(kind=>name.includes(kind));
   const updating=/^(update|delete)/.test(name);
   const existing=updating&&kind?demoState[tables[kind]].find(row=>row.id===args[0]):null;
   if(updating&&kind&&!existing)throw new Error('Record not found.');
   const row={...(existing||{}),...(typeof args[updating?1:0]==='object'?args[updating?1:0]:{})};
   if(kind==='Subject'&&!context.isAdmin)throw new Error('Shared subjects are read-only for CR accounts.');
   if(context.isCR&&kind&&kind!=='Subject'&&(row.section_id!==context.activeSectionId||!context.activeSectionId))throw new Error('Another section cannot be modified.');
   if(name==='updateStudent'||name==='updateSubject'){
    const message=name==='updateStudent'?studentReassignmentError(demoState,existing.id,row.section_id):subjectReassignmentError(demoState,existing.id,row.academic_group_id);
    if(message){const error=new Error(message);error.code='23514';throw error;}
   }
   if(['Student','Subject'].includes(kind)&&!name.startsWith('delete')){
    const field=kind==='Student'?'roll_no':'subject_code';
    if(demoState[tables[kind]].some(item=>item.id!==existing?.id&&item[field]===row[field]&&(kind==='Student'||item.academic_group_id===row.academic_group_id)))throw new Error(`${field} already exists.`);
   }
   if(['TimetableSlot','Lecture'].includes(kind)&&!name.startsWith('delete')){
    const section=demoState.sections.find(s=>s.id===row.section_id),subject=demoState.subjects.find(s=>s.id===row.subject_id);
    if(!section||!subject||section.academic_group_id!==subject.academic_group_id)throw new Error('Invalid section/subject academic group.');
   }
   if(kind==='ScheduleException'&&!name.startsWith('delete')){
    if(!demoState.timetable.some(s=>s.id===row.schedule_slot_id&&s.section_id===row.section_id))throw new Error('Exception section must match its slot.');
   }
   if(kind==='Leave'&&!name.startsWith('delete')){
    if(!demoState.students.some(s=>s.id===row.student_id&&s.section_id===row.section_id))throw new Error('Leave section must match its student.');
   }
   if(kind==='Lecture'&&!name.startsWith('delete')){
    if(!isValidDateKey(row.lecture_date))throw new Error('Invalid lecture date.');
    if(row.schedule_slot_id){
     const slot=demoState.timetable.find(s=>s.id===row.schedule_slot_id);
     if(!slot||slot.section_id!==row.section_id||slot.subject_id!==row.subject_id)throw new Error('Scheduled lecture must match its slot.');
     if((!existing||existing.lecture_date!==row.lecture_date||existing.schedule_slot_id!==row.schedule_slot_id)&&!isSlotScheduledForDate(slot,demoState.schedule_exceptions,row.lecture_date))throw new Error('This slot does not take place on the requested date.');
    }
    if(!Number.isInteger(Number(row.lecture_number))||Number(row.lecture_number)<1)throw new Error('Invalid lecture number.');
    if(demoState.lectures.some(l=>l.id!==existing?.id&&l.section_id===row.section_id&&l.subject_id===row.subject_id&&l.lecture_date===row.lecture_date&&Number(l.lecture_number)===Number(row.lecture_number)))throw new Error('Duplicate lecture.');
    const statuses=args[updating?2:1]||[];
    if(statuses.some(s=>!['present','absent','leave'].includes(s.status)||!demoState.students.some(st=>st.id===s.student_id&&st.section_id===row.section_id)))throw new Error('Invalid attendance student or status.');
   }
  }
  const result=await original.apply(this,args);
  if(demo)localStorage.setItem(demoStorageKey,JSON.stringify(demoState));
  return result;
 };
}
