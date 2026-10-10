// Read-only EXPLAIN ANALYZE checks. Never print connection URLs or provider secrets.
const fs = require('node:fs');
const { Client } = require('pg');
const env = { ...require('dotenv').parse(fs.readFileSync('.env')), ...process.env };
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = /^--(wallet-id|user-id)=([0-9a-f-]{36})$/i.exec(value);
  if (!match || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match[2])) throw new Error('Use --wallet-id=UUID or --user-id=UUID');
  return [match[1],match[2]];
}));
const client = new Client({ connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'wallet-query-plans' });
function nodes(node) {
  return [{node:node['Node Type'],index:node['Index Name']??null,actualRows:node['Actual Rows'],loops:node['Actual Loops'],rowsRemoved:node['Rows Removed by Filter']??0,sharedHits:node['Shared Hit Blocks']??0,sharedReads:node['Shared Read Blocks']??0},...(node.Plans??[]).flatMap(nodes)];
}
(async()=>{
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='2s'");
    const wallet=(await client.query('SELECT id,"userId" FROM wallets ORDER BY "createdAt" DESC LIMIT 1')).rows[0];
    const walletId=args['wallet-id']??wallet?.id;
    const userId=args['user-id']??(args['wallet-id']?(await client.query('SELECT "userId" FROM wallets WHERE id=$1',[walletId])).rows[0]?.userId:wallet?.userId);
    const settings=(await client.query('SELECT current_setting(\'max_connections\') AS "serverMaxConnections",(SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database()) AS "databaseConnections"')).rows[0];
    console.log(JSON.stringify({settings,note:'Use representative wallet/user IDs. Empty or tiny tables may correctly use sequential scans; do not force index usage.'}));
    const checks=[
      ['users-first-page','SELECT id,email,"createdAt" FROM users ORDER BY "createdAt" DESC,id DESC LIMIT 21',[]],
      ['runs-first-page','SELECT * FROM reconciliation_runs ORDER BY "startedAt" DESC,id DESC LIMIT 21',[]],
      ['open-issues','SELECT * FROM reconciliation_issues WHERE status=\'OPEN\' ORDER BY "firstSeenAt" DESC,id DESC LIMIT 21',[]],
    ];
    if(walletId) {
      checks.push(['wallet-transactions-first-page','SELECT * FROM transactions WHERE "senderWalletId"=$1 OR "receiverWalletId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT 21',[walletId]]);
      const boundary=(await client.query('SELECT id,"createdAt" FROM transactions WHERE "senderWalletId"=$1 OR "receiverWalletId"=$1 ORDER BY "createdAt" DESC,id DESC OFFSET 19 LIMIT 1',[walletId])).rows[0];
      if(boundary)checks.push(['wallet-transactions-next-page','SELECT * FROM transactions WHERE ("senderWalletId"=$1 OR "receiverWalletId"=$1) AND ("createdAt"<$2 OR ("createdAt"=$2 AND id<$3)) ORDER BY "createdAt" DESC,id DESC LIMIT 21',[walletId,boundary.createdAt,boundary.id]]);
    }
    if(userId)checks.push(
      ['payouts-first-page','SELECT * FROM payouts WHERE "userId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT 21',[userId]],
      ['beneficiaries-first-page','SELECT * FROM beneficiaries WHERE "userId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT 21',[userId]],
      ['unread-notifications','SELECT id,kind,title,"createdAt" FROM notifications WHERE "userId"=$1 AND "readAt" IS NULL ORDER BY "createdAt" DESC,id DESC LIMIT 21',[userId]],
      ['active-sessions','SELECT id,"createdAt" FROM auth_sessions WHERE "userId"=$1 AND "revokedAt" IS NULL AND "expiresAt">now() ORDER BY "createdAt" DESC',[userId]],
    );
    for(const [name,query,values]of checks){
      const result=await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+query,values);
      const plan=result.rows[0]['QUERY PLAN'][0];
      console.log(JSON.stringify({name,planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],nodes:nodes(plan.Plan)}));
    }
    await client.query('ROLLBACK');
  } finally {await client.end();}
})().catch(async error=>{
  await client.end().catch(()=>{});
  console.error('Database plan inspection failed ('+(error.code??error.errors?.[0]?.code??'connection/query error')+'). Check PostgreSQL availability and migrations.');process.exitCode=1;
});
