(function(root){
  // Zone materials follow the V2 reference: carpet for work, deeper carpet for meetings, tile for pantry, sage rug for lounge; corridors stay oak.
  const layout={version:5,width:48,height:32,tile:16,zones:[
    {x:2,y:4,w:13,h:9,material:'carpet'},{x:32,y:4,w:13,h:9,material:'carpet'},
    {x:2,y:17,w:13,h:9,material:'carpet'},{x:32,y:17,w:13,h:9,material:'carpet'},
    {x:18,y:4,w:12,h:9,material:'carpetDeep'},{x:18,y:18,w:12,h:8,material:'carpet'},
    {x:17,y:26,w:14,h:5,material:'sageRug'},{x:2,y:27,w:13,h:4,material:'tile'},{x:32,y:27,w:13,h:4,material:'floor'}
  ],objects:[],spawns:[{x:23,y:15},{x:12,y:14},{x:35,y:14},{x:12,y:27},{x:35,y:27}]};
  function add(id,asset,x,y,w=1,h=1,options={}){layout.objects.push({id,asset,x,y,width:w,height:h,collision:true,...options})}
  function station(id,x,y,monitor,role){add(id,'desk',x,y,2,1,{name:role+' workstation',kind:'work',role,actions:['work'],capacity:1,slots:[{x:x+1,y:y+2}],visualOffsetY:0});add(id+'-screen',monitor,x,y-1,1,1,{collision:false});add(id+'-chair','chair',x+1,y+1,1,1,{collision:false})}
  station('research',5,8,'researchMonitor','Research');station('analysis',36,8,'chartMonitor','Analysis');station('developer',5,21,'codeMonitor','Development');station('qa',36,21,'checkMonitor','QA');station('ai',24,21,'aiMonitor','AI');station('manager',20,21,'monitor','Planning');
  station('pair',10,21,'codeMonitor','Pair programming');layout.objects.find(o=>o.id==='pair').kind='collaboration';layout.objects.find(o=>o.id==='pair').capacity=2;layout.objects.find(o=>o.id==='pair').slots=[{x:10,y:23},{x:11,y:23}];
  add('meeting','meeting',23,8,2,2,{name:'Meeting table',kind:'collaboration',actions:['discuss'],capacity:6,slots:[{x:22,y:8},{x:22,y:9},{x:25,y:8},{x:25,y:9},{x:23,y:10},{x:24,y:10}]});
  for(const [i,x,y] of [[0,22,8],[1,22,9],[2,25,8],[3,25,9],[4,23,10],[5,24,10]])add('meeting-chair-'+i,'chair',x,y,1,1,{collision:false});
  add('whiteboard','whiteboard',20,4,2,2,{name:'Whiteboard',kind:'planning',actions:['plan','present'],capacity:3,slots:[{x:19,y:6},{x:20,y:6},{x:21,y:6}]});
  add('projectboard','projectboard',26,4,2,2,{name:'Project board',kind:'planning',actions:['plan','review'],capacity:3,slots:[{x:25,y:6},{x:26,y:6},{x:27,y:6}]});
  add('discussion','discussion',39,28,2,2,{name:'Discussion table',kind:'collaboration',actions:['discuss'],capacity:2,slots:[{x:38,y:29},{x:41,y:29}]});
  add('bookshelf','shelf',3,4,1,2,{name:'Research bookshelf',kind:'research',actions:['read'],capacity:1,slots:[{x:3,y:6}]});
  add('documents','cabinet',7,4,1,2,{name:'Document cabinet',kind:'research',actions:['read'],capacity:1,slots:[{x:7,y:6}]});
  add('research-terminal','researchMonitor',11,6,1,1,{name:'Research terminal',kind:'research',actions:['research'],capacity:1,slots:[{x:11,y:7}]});
  add('qa-board','projectboard',40,17,2,2,{name:'Review checklist',kind:'review',actions:['review'],capacity:1,slots:[{x:40,y:19}]});
  add('data-board','whiteboard',40,4,2,2,{name:'Data board',kind:'analysis',actions:['analyse'],capacity:1,slots:[{x:40,y:6}]});
  add('printer','printer',4,28,1,1,{name:'Printer',kind:'utility',actions:['print'],capacity:1,slots:[{x:4,y:29}]});
  add('coffee','coffee',8,27,1,2,{name:'Coffee machine',kind:'break',actions:['get_coffee'],capacity:1,slots:[{x:8,y:29}]});
  add('water','water',11,27,1,2,{name:'Water dispenser',kind:'break',actions:['get_water'],capacity:1,slots:[{x:11,y:29}]});
  add('server','server',43,10,1,2,{name:'Server rack',kind:'utility',actions:['inspect'],capacity:1,slots:[{x:42,y:11}]});
  add('storage','cabinet',34,28,1,2,{name:'Storage cabinet',kind:'utility',actions:['organise'],capacity:1,slots:[{x:35,y:29}]});
  add('sofa','sofa',21,27,2,1,{name:'Sofa',kind:'break',actions:['sit'],capacity:2,slots:[{x:21,y:28},{x:22,y:28}]});
  add('armchair','armchair',26,27,1,1,{name:'Armchair',kind:'break',actions:['sit'],capacity:1,slots:[{x:26,y:28}]});
  add('coffee-table','discussion',23,29,2,2,{name:'Coffee table',kind:'break',actions:['take_break'],capacity:2,slots:[{x:22,y:30},{x:25,y:30}]});
  add('window-view','window',34,0,2,2,{name:'Window',kind:'break',actions:['look_outside'],capacity:1,slots:[{x:34,y:3}]});
  for(const x of [4,12,21,28,41])add('window-'+x,'window',x,0,2,2,{collision:false});
  add('cat','cat',29,28,1,1,{name:'Office cat',kind:'fun',actions:['pet_cat'],capacity:1,slots:[{x:29,y:29}]});
  // Plants only at corners and the lounge edges, never crowding workstations.
  for(const [i,x,y]of [[0,2,11],[3,44,4],[4,2,24],[7,44,17],[8,18,25],[9,29,25]])add('plant-'+i,'plant',x,y,1,1,{name:'Office plant',kind:'fun',actions:['water_plant'],capacity:1,slots:[{x,y:y+1}]});
  // Extra workstations are capacity for future employees; empty desks are intentional.
  for(const [id,x,y,monitor,role] of [
    ['research-extra',10,8,'researchMonitor','Research'],['research-bench',4,11,'researchMonitor','Research'],
    ['analysis-extra',33,8,'chartMonitor','Analysis'],['analysis-bench',41,8,'chartMonitor','Analysis'],
    ['dev-extra',7,18,'codeMonitor','Development'],['dev-bench',11,18,'codeMonitor','Development'],
    ['qa-extra',33,21,'checkMonitor','QA'],['qa-bench',41,21,'checkMonitor','QA'],['qa-terminal',36,18,'checkMonitor','QA'],
    ['ai-extra',27,21,'aiMonitor','AI'],['ai-bench',24,24,'aiMonitor','AI']
  ])station(id,x,y,monitor,role);
  add('discussion-small','discussion',19,10,2,2,{name:'Small discussion table',kind:'collaboration',actions:['discuss'],capacity:2,slots:[{x:18,y:11},{x:21,y:11}]});
  add('meeting-sofa','sofa',27,10,2,1,{name:'Meeting lounge',kind:'break',actions:['sit'],capacity:2,slots:[{x:27,y:11},{x:28,y:11}]});
  layout.homeByAgent=['manager','research','analysis','developer','qa'];
  const api=layout;if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OfficeLayout=api;
})(typeof window!=='undefined'?window:globalThis);
