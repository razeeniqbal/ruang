/* Pixel icons for the hotbar and windows, drawn from 12x12 bitmaps so they match the office art without
   extra image files. Use <i class="pi pi-Inbox"></i>; the classes are added to the page once. */
(function(){
  const COLORS={k:'#0b1118',w:'#f1e9d2',g:'#e5c77b',b:'#5fa8d3',G:'#79c26a',s:'#b8ab8f',r:'#d9574a'};
  const ICONS={
    Inbox:['............','............','kkkkkkkkkkkk','kwwwwwwwwwwk','kkwwwwwwwwkk','kwkwwwwwwkwk','kwwkwwwwkwwk','kwwwkkkkwwwk','kwwwwwwwwwwk','kssssssssssk','kkkkkkkkkkkk','............'],
    Employees:['............','...kk...kk..','..kggk.kbbk.','..kggk.kbbk.','...kk...kk..','.kkkkk.kkkk.','kggggkkbbbbk','kggggkkbbbbk','kggggkkbbbbk','kkkkkkkkkkkk','............','............'],
    Projects:['kkkkkkkkkkkk','kwwwwwwwwwwk','kwbbwwggwwwk','kwbbwwggwwwk','kwwwwwwwwwwk','kwbbbbwGGwwk','kwwwwwwwwwwk','kkkkkkkkkkkk','....k..k....','...k....k...','..k......k..','............'],
    Tasks:['............','.kkk........','.kGk.kkkkkk.','.kkk........','............','.kkk........','.kGk.kkkkkk.','.kkk........','............','.kkk........','.k.k.kkkkkk.','.kkk........'],
    Files:['............','.kkkk.......','kggggkkkkkkk','kggggggggggk','kwwwwwwwwwwk','kggggggggggk','kggggggggggk','kggggggggggk','kggggggggggk','kkkkkkkkkkkk','............','............'],
    Code:['kkkkkkkkkkkk','kbbbbbbbbbbk','kbGGbbbbbbbk','kbbbGGGbbbbk','kbGGGbbbbbbk','kbbbbbggbbbk','kbbbbbbbbbbk','kkkkkkkkkkkk','.....kk.....','...kkkkkk...','............','............'],
    Activity:['............','.kkkkkkkkkk.','kwwwwwwwwwwk','kwkkkkkkkkwk','kwwwwwwwwwwk','kwkkkkkkwwwk','kwwwwwwwwwwk','.kkkwkkkkkk.','...kwk......','...kk.......','............','............'],
    Settings:['....kkkk....','.kk.kggk.kk.','.kgkkggkkgk.','..kggggggk..','kkgggkkgggkk','kgggk..kgggk','kgggk..kgggk','kkgggkkgggkk','..kggggggk..','.kgkkggkkgk.','.kk.kggk.kk.','....kkkk....'],
    Search:['............','..kkkk......','.kwwwwk.....','kwwbbwwk....','kwbwwwwk....','kwwwwwwk....','.kwwwwk.....','..kkkkgk....','......kgk...','.......kgk..','........kk..','............'],
    Office:['.....kk.....','....kggk....','...kggggk...','..kggggggk..','.kggggggggk.','kkkkkkkkkkkk','.kwwwwwwwwk.','.kwbbwwkkwk.','.kwbbwwkgwk.','.kwwwwwkgwk.','.kkkkkkkkkk.','............']
  };
  function url(rows){
    const c=document.createElement('canvas');c.width=12;c.height=12;const g=c.getContext('2d');
    rows.forEach((row,y)=>[...row].forEach((ch,x)=>{if(COLORS[ch]){g.fillStyle=COLORS[ch];g.fillRect(x,y,1,1)}}));
    return c.toDataURL('image/png');
  }
  const style=document.createElement('style');style.id='pixel-icons';
  style.textContent=Object.entries(ICONS).map(([name,rows])=>`.pi-${name}{background-image:url(${url(rows)})}`).join('\n');
  document.head.append(style);
  window.PixelIcons={names:Object.keys(ICONS)};
  // Monaco measures its font once; measure again when the pixel font has loaded.
  document.fonts?.load("20px 'VT323'").then(()=>window.RuangMonaco?.editor?.remeasureFonts?.()).catch(()=>{});
})();
