import {download,lectureStats} from './ui.js';
import {attendanceStats} from './attendance-math.js';

const BLUE=[22,119,255],NAVY=[18,32,51],MUTED=[105,120,140];
const PRESENT=[22,128,75],ABSENT=[205,48,59],LEAVE=[230,151,24];
const LECTURE_COLUMNS=['Sr No','Roll No','Student Name','Status'].map(key=>({key,label:key}));
const WIDTHS={'Sr No':8,'Roll No':18,'Roll Number':18,'Student Name':29,Student:29,Subject:32,'Subject Code':17,Teacher:27,Status:14,Date:17,Section:12,'Lecture Number':14,Present:12,Absent:12,'Total Lectures':16,'Attendance %':17,Percentage:17};

function lectureRows(data,lecture){
 return data.attendance.filter(a=>a.lecture_id===lecture.id).map((a,i)=>{
  const student=data.students.find(s=>s.id===a.student_id)||{};
  return{'Sr No':i+1,'Roll No':student.roll_no||'','Student Name':student.name||'',Status:a.status==='present'?'Present':a.status==='leave'?'Leave':'Absent'};
 });
}

export function formatReportDate(value){
 if(!value)return'';
 const date=value instanceof Date?value:new Date(`${value}T00:00:00`);
 return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(date);
}

function safeStem(value){return String(value||'attendance-report').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'attendance-report'}
function outputName(value,ext){return`${safeStem(value)}.${ext}`}
function columnsFor(rows,options={}){return options.columns?.length?options.columns.map(c=>typeof c==='string'?{key:c,label:c}:c):Object.keys(rows[0]||{}).map(key=>({key,label:key}))}
function cellValue(value){if(value===null||value===undefined)return'';if(value instanceof Date)return formatReportDate(value);return typeof value==='object'?JSON.stringify(value):value}
function globalMetadata(options){const org=options.organization||{};return[['University Name',org.universityName],['Class / Department',org.className],['Semester',org.semesterName],...(options.metadata||[]).map(x=>[x.label,x.value])].filter(([,value])=>value!==null&&value!==undefined&&String(value)!=='')}
function summaryFor(rows,options={}){
 if(options.summary)return options.summary;
 const counts=rows.some(row=>Object.hasOwn(row,'Status'))?attendanceStats(rows.map(row=>({status:String(row.Status).toLowerCase()==='leave'?'leave':String(row.Status).toLowerCase()==='present'?'present':'absent'})),options.policy):attendanceStats({present:rows.reduce((n,row)=>n+(Number(row.Present)||0),0),absent:rows.reduce((n,row)=>n+(Number(row.Absent)||0),0),leave:rows.reduce((n,row)=>n+(Number(row['On Leave']??row.Leave)||0),0)},options.policy);
 const totalLectures=rows.reduce((n,row)=>n+(Number(row['Total Lectures'])||0),0);
 return{...counts,total:totalLectures||counts.total||rows.length,totalLabel:totalLectures?'Total Lectures':(counts.total?'Total Students':'Total Records')};
}
function lectureOptions(data,lecture){
 const subject=data.subjects.find(s=>s.id===lecture.subject_id)||{},stats=lectureStats(data,lecture);
 return{title:'CLASS ATTENDANCE REPORT',fileName:`${subject.subject_name||subject.subject_code||'Attendance'}-Lecture-${String(lecture.lecture_number||1).padStart(2,'0')}-${lecture.lecture_date||''}`,organization:{universityName:data.settings?.university_name,className:data.settings?.class_name,semesterName:data.settings?.semester_name},policy:data.settings?.leave_calculation_policy,metadata:[{label:'Subject',value:subject.subject_name},{label:'Subject Code',value:subject.subject_code},{label:'Teacher',value:subject.teacher_name},{label:'Section',value:lecture.section||subject.section},{label:'Date',value:formatReportDate(lecture.lecture_date)},{label:'Lecture Number',value:lecture.lecture_number}],summary:{total:stats.total,present:stats.present,absent:stats.absent,leave:stats.leave,percentage:stats.percentage,totalLabel:'Total Students'},columns:LECTURE_COLUMNS};
}

export function exportLectureExcel(data,lecture){const options=lectureOptions(data,lecture);return exportTableExcel(options.fileName,lectureRows(data,lecture),options)}
export function exportLecturePdf(data,lecture){const options=lectureOptions(data,lecture);return exportTablePdf(options.title,lectureRows(data,lecture),options)}
export function exportLectureCsv(data,lecture){
 const subject=data.subjects.find(s=>s.id===lecture.subject_id)||{};
 const rows=data.attendance.filter(a=>a.lecture_id===lecture.id).map(a=>{const student=data.students.find(s=>s.id===a.student_id)||{};return{Date:lecture.lecture_date||'',Subject:subject.subject_name||'','Subject Code':subject.subject_code||'','Lecture Number':lecture.lecture_number||'',Section:lecture.section||subject.section||'','Roll Number':student.roll_no||'','Student Name':student.name||'',Status:a.status==='present'?'Present':a.status==='leave'?'Leave':'Absent'}});
 return exportTableCsv(`${subject.subject_name||subject.subject_code||'Attendance'}-Lecture-${String(lecture.lecture_number||1).padStart(2,'0')}-${lecture.lecture_date||''}`,rows,{policy:data.settings?.leave_calculation_policy,summary:{...lectureStats(data,lecture),totalLabel:'Total Students'},columns:[{key:'Date',label:'Date'},{key:'Subject',label:'Subject'},{key:'Subject Code',label:'Subject Code'},{key:'Lecture Number',label:'Lecture Number'},{key:'Section',label:'Section'},{key:'Roll Number',label:'Roll Number'},{key:'Student Name',label:'Student Name'},{key:'Status',label:'Status'}]});
}

export function exportTableExcel(name,rows,options={}){
 const columns=columnsFor(rows,options),summary=summaryFor(rows,options),wb=XLSX.utils.book_new();
 const info=[['CLASS ATTENDANCE REPORT'],[],['Report',options.title||name],...globalMetadata(options),[]];
 if(options.showSummary!==false)info.push(['SUMMARY'],[summary.totalLabel||'Total Records',summary.total||0],['Present',summary.present||0],['Absent',summary.absent||0],['On Leave',summary.leave||0],['Attendance %',summary.percentage||0]);
 else if(options.minimumAttendance!==undefined)info.push(['REPORT REQUIREMENTS']);
 if(options.minimumAttendance!==undefined)info.push(['Minimum Attendance Requirement',`${options.minimumAttendance}%`]);
 const summarySheet=XLSX.utils.aoa_to_sheet(info);summarySheet['!cols']=[{wch:34},{wch:28}];summarySheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}}];
 XLSX.utils.book_append_sheet(wb,summarySheet,'Summary');
 const records=[columns.map(c=>c.label),...rows.map(row=>columns.map(c=>cellValue(row[c.key])))],recordsSheet=XLSX.utils.aoa_to_sheet(records);
 recordsSheet['!cols']=columns.map(c=>({wch:WIDTHS[c.label]||24}));
 if(columns.length)recordsSheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(rows.length,1),c:columns.length-1}})};
 XLSX.utils.book_append_sheet(wb,recordsSheet,'Attendance Records');
 const result=outputName(options.fileName||name,'xlsx');XLSX.writeFile(wb,result);return result;
}

export function exportTableCsv(name,rows,options={}){
 const columns=columnsFor(rows,options);if(!columns.length)return false;
 const csvRows=[columns.map(c=>c.label),...rows.map(row=>columns.map(c=>row[c.key]))];
 if(options.showSummary===true){const summary=summaryFor(rows,options);csvRows.push([],['SUMMARY'],[summary.totalLabel||'Total Records',summary.total||0],['Present',summary.present||0],['Absent',summary.absent||0],['On Leave',summary.leave||0],['Attendance %',summary.percentage||0])}
 const content=csvRows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
 download(outputName(options.fileName||name,'csv'),`\uFEFF${content}`,'text/csv;charset=utf-8');return true;
}

function drawHeader(doc,options,width){
 let y=16;doc.setTextColor(...NAVY);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(options.title||'CLASS ATTENDANCE REPORT',width/2,y,{align:'center'});y+=7;
 const org=options.organization||{},lines=[org.universityName,org.className,org.semesterName].filter(Boolean);
 if(lines.length){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...MUTED);for(const line of lines){doc.text(String(line),width/2,y,{align:'center'});y+=4.2}y+=2}
 return y;
}
function drawMetadata(doc,metadata,y,width){
 if(!metadata.length)return y;const left=14,right=width/2+2,colWidth=width/2-22;
 for(let i=0;i<metadata.length;i+=2){
  for(let col=0;col<2;col++){const item=metadata[i+col];if(!item)continue;const x=col?right:left;doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...NAVY);doc.text(`${item[0]}:`,x,y);const labelWidth=doc.getTextWidth(`${item[0]}: `);doc.setFont('helvetica','normal');doc.setTextColor(70,83,101);doc.text(String(item[1]),x+labelWidth,y,{maxWidth:colWidth-labelWidth})}
  y+=6;
 }
 return y+2;
}
function drawSummary(doc,summary,y,width){
 if(!summary)return y;const values=[[summary.totalLabel||'Total Students',summary.total||0,[238,243,249],NAVY],['Present',summary.present||0,[226,247,235],PRESENT],['Absent',summary.absent||0,[255,234,236],ABSENT],['On Leave',summary.leave||0,[255,241,209],LEAVE],['Attendance %',`${summary.percentage||0}%`,[231,242,255],BLUE]],gap=3,boxWidth=(width-28-gap*4)/5;
 values.forEach((item,i)=>{const x=14+i*(boxWidth+gap);doc.setFillColor(...item[2]);doc.setDrawColor(224,231,240);doc.roundedRect(x,y,boxWidth,16,1.5,1.5,'FD');doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...MUTED);doc.text(item[0],x+3,y+5.5);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...item[3]);doc.text(String(item[1]),x+3,y+12.5)});
 return y+23;
}

export function exportTablePdf(title,rows,options={}){
 const {jsPDF}=window.jspdf,columns=columnsFor(rows,options),orientation=options.orientation||(columns.length>6?'landscape':'portrait'),doc=new jsPDF({orientation,unit:'mm',format:'a4'}),width=doc.internal.pageSize.getWidth();
 let y=drawHeader(doc,{...options,title:options.title||title},width);y=drawMetadata(doc,globalMetadata(options),y,width);
 if(options.showSummary!==false)y=drawSummary(doc,summaryFor(rows,options),y,width);
 if(options.minimumAttendance!==undefined){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...NAVY);doc.text(`Minimum Required Attendance: ${options.minimumAttendance}%`,14,y);y+=9}
 if(columns.length){const available=width-28,widthTotal=columns.reduce((sum,column)=>sum+(WIDTHS[column.label]||24),0),scale=available/widthTotal;doc.autoTable({startY:y,margin:{left:14,right:14,bottom:22},head:[columns.map(c=>c.label)],body:rows.map(row=>columns.map(c=>cellValue(row[c.key]))),theme:'striped',styles:{font:'helvetica',fontSize:8.7,cellPadding:2.2,textColor:NAVY,overflow:'linebreak',lineColor:[225,231,239],lineWidth:.15},headStyles:{fillColor:BLUE,textColor:[255,255,255],fontStyle:'bold',fontSize:8.7},alternateRowStyles:{fillColor:[246,248,251]},columnStyles:Object.fromEntries(columns.map((c,i)=>[i,{cellWidth:(WIDTHS[c.label]||24)*scale}])),didParseCell:cell=>{if(cell.section==='body'&&columns[cell.column.index]?.key==='Status'){const status=String(cell.cell.raw).toLowerCase();cell.cell.styles.textColor=status==='present'?PRESENT:status==='leave'?LEAVE:ABSENT;cell.cell.styles.fontStyle='bold'}}})}
 const now=new Date(),date=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(now),time=new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}).format(now),pageCount=doc.internal.getNumberOfPages();
 for(let page=1;page<=pageCount;page++){doc.setPage(page);const height=doc.internal.pageSize.getHeight();doc.setDrawColor(225,231,239);doc.setLineWidth(.25);doc.line(14,height-15,width-14,height-15);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...MUTED);doc.text(`Class Attendance System  |  Generated: ${date}, ${time}`,14,height-9);doc.text(`Page ${page} of ${pageCount}`,width-14,height-9,{align:'right'})}
 const result=outputName(options.fileName||title,'pdf');doc.save(result);return result;
}
