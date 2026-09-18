const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const PORT=process.env.PORT||3000, PIN=process.env.OWNER_PIN||'2468', DB=path.join('/tmp','shoe-cleaning-data.json')
if(!fs.existsSync(DB))fs.writeFileSync(DB,'[]');
const read=()=>JSON.parse(fs.readFileSync(DB,'utf8')), write=x=>fs.writeFileSync(DB,JSON.stringify(x,null,2));
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj))};
const body=req=>new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}})});
const token=crypto.randomBytes(24).toString('hex');
function auth(req){return (req.headers.authorization||'')==='Bearer '+token}
const server=http.createServer(async(req,res)=>{
 try{
  const u=url.parse(req.url,true), p=u.pathname;
  if(req.method==='GET'&&p==='/api/availability'){let d=read().filter(x=>x.date===u.query.date&&x.status!=='cancelled').map(x=>x.time);return send(res,200,{booked:d})}
  if(req.method==='POST'&&p==='/api/bookings'){let b=await body(req);for(const k of ['name','phone','service','date','time'])if(!b[k])return send(res,400,{error:'Missing required information.'});if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date))return send(res,400,{error:'Invalid date.'});let valid=['10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM'];if(!valid.includes(b.time))return send(res,400,{error:'Invalid time.'});let db=read();if(db.some(x=>x.date===b.date&&x.time===b.time&&x.status!=='cancelled'))return send(res,409,{error:'That time was just booked. Please choose another time.'});let item={id:crypto.randomBytes(4).toString('hex').toUpperCase(),...b,status:'pending',createdAt:new Date().toISOString()};db.push(item);write(db);return send(res,201,{id:item.id,status:item.status})}
  if(req.method==='POST'&&p==='/api/admin/login'){let b=await body(req);if(String(b.pin)!==String(PIN))return send(res,401,{error:'Invalid PIN.'});return send(res,200,{token})}
  if(req.method==='GET'&&p==='/api/admin/bookings'){if(!auth(req))return send(res,401,{error:'Unauthorized'});return send(res,200,read().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)))}
  if(req.method==='PATCH'&&p.startsWith('/api/admin/bookings/')){if(!auth(req))return send(res,401,{error:'Unauthorized'});let id=p.split('/').pop(),b=await body(req),db=read(),i=db.findIndex(x=>x.id===id);if(i<0)return send(res,404,{error:'Not found'});if(!['pending','confirmed','completed','cancelled'].includes(b.status))return send(res,400,{error:'Invalid status'});db[i].status=b.status;write(db);return send(res,200,db[i])}
  if(req.method==='GET'){let file=p==='/'?'index.html':p.slice(1),fp=path.join(__dirname,'public',file);if(!fp.startsWith(path.join(__dirname,'public'))||!fs.existsSync(fp))return send(res,404,{error:'Not found'});let ext=path.extname(fp),types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});return fs.createReadStream(fp).pipe(res)}
  send(res,404,{error:'Not found'})
 }catch(e){send(res,500,{error:'Server error'})}
});
module.exports=(req,res)=>server.emit('request',req,res);
if(require.main===module){
  server.listen(PORT,()=>console.log(`Shoe Cleaning app running on http://localhost:${PORT}`));
}