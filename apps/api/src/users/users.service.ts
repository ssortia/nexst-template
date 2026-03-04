import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Role, User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(email: string, hashedPassword: string): Promise<User> {
    return this.prisma.user.create({ data: { email, password: hashedPassword } });
  }

  async updateRole(callerId: string, targetId: string, role: Role) {
    if (callerId === targetId) throw new ForbiddenException('Cannot change your own role');
    return this.prisma.user.update({
      where: { id: targetId },
      data: { role },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
  }
}
