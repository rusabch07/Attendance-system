import {SUPABASE_URL,SUPABASE_ANON_KEY,configured} from './config.js';

const demo = new URLSearchParams(location.search).get('demo') === '1';
const qs = demo ? '?demo=1' : '';
const client = configured && window.supabase ? window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
const uid=()=>crypto.randomUUID();
const today=new Date().toISOString().slice(0,10);
const daysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10)};
const students=[
 ['2025-EE-321','REG-25-321','Ali Hassan','A','2','ali@example.com','0300-1111111'],['2025-EE-322','REG-25-322','Ahmed Raza','A','2','ahmed@example.com','0300-2222222'],['2025-EE-323','REG-25-323','Usman Khan','A','2','usman@example.com','0300-3333333'],['2025-EE-324','REG-25-324','Shams Ul Haq','A','2','',''],['2025-EE-325','REG-25-325','Rusab Ali','A','2','',''],['2025-EE-326','REG-25-326','Hamza Siddiqui','A','2','',''],['2025-EE-327','REG-25-327','Bilal Ahmed','A','2','',''],['2025-EE-328','REG-25-328','Zain Malik','A','2','','']
].map((x,i)=>({id:`stu-${i+1}`,roll_no:x[0],registration_no:x[1],name:x[2],section:x[3],semester:x[4],email:x[5],phone:x[6],created_at:new Date().toISOString()}));
const subjects=[
 ['Electric Machinery Fundamentals','EE-302','Dr. Ayesha Malik','2','A',3],['Electronic Devices & Circuits','EE-304','Engr. Hassan Rafiq','2','A',3],['Linear Algebra','MTH-221','Dr. Nadia Saeed','2','A',3],['Circuit Analysis','EE-306','Engr. Omer Farooq','2','A',4],['Engineering Mathematics','MTH-201','Dr. Sara Khan','2','A',3]
].map((x,i)=>({id:`sub-${i+1}`,subject_name:x[0],subject_code:x[1],teacher_name:x[2],semester:x[3],section:x[4],credit_hours:x[5],created_at:new Date().toISOString()}));
const demoState={students,subjects,lectures:[],attendance:[],settings:{id:'set-1',class_name:'Electrical Engineering 2025',semester_name:'Semester 2',university_name:'National University',minimum_attendance:75},profile:{name:'Class Representative',role:'cr'}};
for(let s=0;s<subjects.length;s++)for(let l=1;l<=Math.max(4,9-s);l++){const lecture={id:`lec-${s+1}-${l}`,subject_id:subjects[s].id,lecture_number:l,lecture_date:daysAgo((9-l)*2+s),section:'A',created_by:'demo-user',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};demoState.lectures.push(lecture);students.forEach((st,i)=>demoState.attendance.push({id:uid(),lecture_id:lecture.id,student_id:st.id,status:((i+s+l)%7===0||(i===3&&s===3&&l%2===0))?'absent':'present',marked_at:new Date().toISOString(),updated_at:new Date().toISOString()}))}

function check(res){if(res.error)throw res.error;return res.data}
async function table(name){return check(await client.from(name).select('*'))}
export const DB={
  demo,configured,isReady:demo||configured,qs,
  async signIn(email,password){if(demo)return {user:{id:'demo-user',email:'cr@class.edu'}};return check(await client.auth.signInWithPassword({email,password}))},
  async signOut(){if(!demo&&client)await client.auth.signOut()},
  async session(){if(demo)return {user:{id:'demo-user',email:'cr@class.edu'}};if(!client)return null;return (await client.auth.getSession()).data.session},
  async user(){if(demo)return {id:'demo-user',email:'cr@class.edu'};const s=await this.session();return s?.user||null},
  async all(){if(demo)return structuredClone(demoState);const [students,subjects,lectures,attendance,settings,profiles]=await Promise.all([table('students'),table('subjects'),table('lectures'),table('attendance'),table('settings'),table('profiles')]);const u=await this.user();return {students,subjects,lectures,attendance,settings:settings[0]||{},profile:profiles.find(p=>p.user_id===u?.id)||{name:u?.email||'CR',role:'cr'}}},
  async addStudent(row){if(demo){if(demoState.students.some(x=>x.roll_no===row.roll_no))throw new Error('Roll number already exists.');const v={...row,id:uid(),created_at:new Date().toISOString()};demoState.students.push(v);return v}return check(await client.from('students').insert(row).select().single())},
  async updateStudent(id,row){if(demo){Object.assign(demoState.students.find(x=>x.id===id),row);return}return check(await client.from('students').update(row).eq('id',id))},
  async deleteStudent(id){if(demo){demoState.students=demoState.students.filter(x=>x.id!==id);demoState.attendance=demoState.attendance.filter(x=>x.student_id!==id);return}return check(await client.from('students').delete().eq('id',id))},
  async addSubject(row){if(demo){if(demoState.subjects.some(x=>x.subject_code===row.subject_code))throw new Error('Subject code already exists.');const v={...row,id:uid(),created_at:new Date().toISOString()};demoState.subjects.push(v);return v}return check(await client.from('subjects').insert(row).select().single())},
  async updateSubject(id,row){if(demo){Object.assign(demoState.subjects.find(x=>x.id===id),row);return}return check(await client.from('subjects').update(row).eq('id',id))},
  async deleteSubject(id){if(demo){const lectureIds=demoState.lectures.filter(x=>x.subject_id===id).map(x=>x.id);demoState.subjects=demoState.subjects.filter(x=>x.id!==id);demoState.lectures=demoState.lectures.filter(x=>x.subject_id!==id);demoState.attendance=demoState.attendance.filter(x=>!lectureIds.includes(x.lecture_id));return}return check(await client.from('subjects').delete().eq('id',id))},
  async findDuplicate(subject_id,lecture_date,lecture_number){if(demo)return demoState.lectures.find(x=>x.subject_id===subject_id&&x.lecture_date===lecture_date&&Number(x.lecture_number)===Number(lecture_number))||null;const r=await client.from('lectures').select('*').eq('subject_id',subject_id).eq('lecture_date',lecture_date).eq('lecture_number',lecture_number).maybeSingle();return check(r)},
  async saveLecture(meta,statuses){const u=await this.user();if(demo){const lecture={...meta,id:uid(),created_by:u.id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};demoState.lectures.push(lecture);statuses.forEach(x=>demoState.attendance.push({id:uid(),lecture_id:lecture.id,student_id:x.student_id,status:x.status,marked_at:new Date().toISOString(),updated_at:new Date().toISOString()}));return lecture}const lecture=check(await client.from('lectures').insert({...meta,created_by:u.id}).select().single());try{check(await client.from('attendance').insert(statuses.map(x=>({...x,lecture_id:lecture.id}))))}catch(e){await client.from('lectures').delete().eq('id',lecture.id);throw e}return lecture},
  async updateLecture(id,meta,statuses){if(demo){Object.assign(demoState.lectures.find(x=>x.id===id),meta,{updated_at:new Date().toISOString()});statuses.forEach(x=>{const a=demoState.attendance.find(y=>y.lecture_id===id&&y.student_id===x.student_id);if(a)Object.assign(a,{status:x.status,updated_at:new Date().toISOString()});else demoState.attendance.push({id:uid(),lecture_id:id,student_id:x.student_id,status:x.status,marked_at:new Date().toISOString(),updated_at:new Date().toISOString()})});return}check(await client.from('lectures').update({...meta,updated_at:new Date().toISOString()}).eq('id',id));check(await client.from('attendance').upsert(statuses.map(x=>({...x,lecture_id:id,updated_at:new Date().toISOString()})),{onConflict:'lecture_id,student_id'}))},
  async deleteLecture(id){if(demo){demoState.lectures=demoState.lectures.filter(x=>x.id!==id);demoState.attendance=demoState.attendance.filter(x=>x.lecture_id!==id);return}return check(await client.from('lectures').delete().eq('id',id))},
  async saveSettings(row){if(demo){Object.assign(demoState.settings,row);return}const existing=await table('settings');if(existing[0])return check(await client.from('settings').update(row).eq('id',existing[0].id));return check(await client.from('settings').insert(row))},
  async saveProfile(name){if(demo){demoState.profile.name=name;return}const u=await this.user();return check(await client.from('profiles').update({name}).eq('user_id',u.id))},
  async changePassword(password){if(demo)return;return check(await client.auth.updateUser({password}))},
  today
};
