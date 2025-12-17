// Test parsing one line to see column structure
const testLine = 'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا	10%	R	internship	R		R		R				S		R	متطوعو الاتصال 	R	متطوعو التمويل 	R	متطوعو المتابعة 	R	متطوعو ادارة الحالة 			A, R		R	متطوعو التنظيم 			R, A		S, C	';

const parts = testLine.split('\t');
console.log('Total columns:', parts.length);
console.log('\nColumn structure:');
console.log('0. KPI:', parts[0]);
console.log('1. Target:', parts[1]);
console.log('2. HR:', parts[2]);
console.log('3. Procurement:', parts[3]);
console.log('4. Operations:', parts[4]);
console.log('5. Finance:', parts[5]);
console.log('6. Admin:', parts[6]);
console.log('7. IT:', parts[7]);
console.log('8. Communication:', parts[8]);
console.log('9. DFR:', parts[9]);
console.log('10. MEL:', parts[10]);
console.log('11. Case:', parts[11]);
console.log('12. BD:', parts[12]);
console.log('13. Volunteer:', parts[13]);
console.log('14. LMF:', parts[14]);
console.log('15. S&S:', parts[15]);
console.log('16. Offices:', parts[16]);
console.log('17. SiS:', parts[17]);

