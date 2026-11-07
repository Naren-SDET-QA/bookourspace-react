export type VenueWallTime = { date: string; time: string };

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const formatter = (timeZone: string) => {
  let value=formatterCache.get(timeZone);
  if(!value){value=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatterCache.set(timeZone,value);}
  return value;
};

function partsAt(epoch:number,timeZone:string){
  const parts=formatter(timeZone).formatToParts(new Date(epoch));
  const get=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(p=>p.type===type)?.value);
  return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second')};
}

/** Convert venue wall-clock input to every matching instant (0=gap, 2=fold). */
export function venueWallTimeCandidates({date,time}:VenueWallTime,timeZone:string):Date[]{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);const tm=/^(\d{2}):(\d{2})$/.exec(time);
  if(!match||!tm) return [];
  const wanted={year:Number(match[1]),month:Number(match[2]),day:Number(match[3]),hour:Number(tm[1]),minute:Number(tm[2]),second:0};
  if(wanted.month<1||wanted.month>12||wanted.day<1||wanted.day>31||wanted.hour>23||wanted.minute>59)return [];
  const naive=Date.UTC(wanted.year,wanted.month-1,wanted.day,wanted.hour,wanted.minute);
  const actualDate=new Date(naive);
  if(actualDate.getUTCFullYear()!==wanted.year||actualDate.getUTCMonth()!==wanted.month-1||actualDate.getUTCDate()!==wanted.day)return [];
  const offsets=new Set<number>();
  // Sampling both sides of the local date captures standard/daylight offsets and
  // historical sub-hour transitions without guessing from the device timezone.
  for(let hours=-48;hours<=48;hours+=3){
    const probe=naive+hours*3600000;const local=partsAt(probe,timeZone);
    offsets.add(Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second)-probe);
  }
  const candidates=[...offsets].map(offset=>naive-offset).filter(epoch=>{
    const local=partsAt(epoch,timeZone);
    return local.year===wanted.year&&local.month===wanted.month&&local.day===wanted.day&&local.hour===wanted.hour&&local.minute===wanted.minute;
  }).sort((a,b)=>a-b);
  return [...new Set(candidates)].map(epoch=>new Date(epoch));
}

export function venueDateTimeLabel(value:string,timeZone:string){
  // Intl rejects timeZoneName alongside dateStyle/timeStyle; spell the parts
  // out so venue-local labels work in browsers as well as server-side tests.
  return new Intl.DateTimeFormat('en-IN',{timeZone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
}

export function venueToday(timeZone:string,daysAhead=0){
  const date=partsAt(Date.now()+daysAhead*86400000,timeZone);
  return `${date.year}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`;
}
