import { installTestOwner } from '../src/server/auth.js';

process.env.DATABASE_URL ??= 'postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil';

installTestOwner('test-owner-token', { id: '00000000-0000-4000-8000-000000000001' });
installTestOwner('test-owner-two-token', { id: '00000000-0000-4000-8000-000000000002' });
